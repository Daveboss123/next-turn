//! Reads the encrypted memos out of shielded Zcash transactions using a
//! view-only key.
//!
//! This is the one part of Sealed Tender that needs real Zcash cryptography.
//! Everything a bidder touches is plain browser code; only *reading* the sealed
//! bids back off the chain requires note decryption, which is what happens here.
//!
//! Why this is a command-line tool rather than a web page: an auditor who has to
//! trust our website to tell them the website is honest has gained nothing. This
//! binary takes a published viewing key and talks straight to a public Zcash
//! light-client server, so anyone can reconstruct a tender's bids without our
//! involvement.
//!
//! Commands:
//!   tender-verify tip    <main|test> <server>
//!   tender-verify keygen <main|test>
//!   tender-verify read   <main|test> <server> <ufvk> <txid>...

use std::collections::HashMap;

use anyhow::{Context, Result, anyhow, bail};
use zcash_client_backend::decrypt_transaction;
use zcash_client_backend::proto::service::{
    ChainSpec, TxFilter, compact_tx_streamer_client::CompactTxStreamerClient,
};
use zcash_keys::keys::{UnifiedAddressRequest, UnifiedFullViewingKey, UnifiedSpendingKey};
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::{BlockHeight, BranchId, Network};
use zcash_protocol::memo::{Memo, MemoBytes};

/// We only ever decrypt with a single key here, so the account id is a constant.
const ACCOUNT: u32 = 0;

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        usage();
    }

    match args[0].as_str() {
        "tip" if args.len() == 3 => tip(parse_network(&args[1])?, args[2].clone()).await,
        "keygen" if args.len() == 2 => keygen(parse_network(&args[1])?),
        "read" if args.len() >= 5 => {
            read(
                parse_network(&args[1])?,
                args[2].clone(),
                &args[3],
                &args[4..],
            )
            .await
        }
        _ => usage(),
    }
}

fn usage() -> ! {
    eprintln!(
        "tender-verify - read sealed tender bids from the Zcash chain\n\n\
         commands:\n  \
         tip    <main|test> <server>                     check the server is reachable\n  \
         keygen <main|test>                              make a tender address and viewing key\n  \
         read   <main|test> <server> <ufvk> <txid>...    decrypt memos from transactions\n\n\
         example:\n  \
         tender-verify tip test https://testnet.zec.rocks:443"
    );
    std::process::exit(2);
}

fn parse_network(s: &str) -> Result<Network> {
    match s {
        "main" => Ok(Network::MainNetwork),
        "test" => Ok(Network::TestNetwork),
        other => bail!("network must be 'main' or 'test', got {other:?}"),
    }
}

async fn connect(server: &str) -> Result<CompactTxStreamerClient<tonic::transport::Channel>> {
    CompactTxStreamerClient::connect(server.to_string())
        .await
        .with_context(|| format!("could not reach the light-client server at {server}"))
}

/// Smoke test: ask the server for the current chain tip.
///
/// Worth having as its own command because it separates "the network is broken"
/// from "the key is wrong", which otherwise look identical at the call site.
async fn tip(_network: Network, server: String) -> Result<()> {
    let mut client = connect(&server).await?;
    let block = client
        .get_latest_block(ChainSpec {})
        .await
        .context("the server refused the request")?
        .into_inner();

    println!("server:  {server}");
    println!("height:  {}", block.height);
    println!("hash:    {}", hex::encode(block.hash.iter().rev().copied().collect::<Vec<_>>()));
    Ok(())
}

/// Generate a fresh tender address plus the viewing key that reads it.
///
/// Note on what gets published later: this prints the *full* viewing key, which
/// also carries outgoing-view capability. A tender should publish only the
/// incoming viewing key, so that disclosing the bid set does not also expose the
/// organiser's own spends from that address. Narrowing this is a known todo and
/// is noted in the README rather than quietly glossed over.
fn keygen(network: Network) -> Result<()> {
    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed).context("could not get randomness from the operating system")?;

    let account = zip32::AccountId::ZERO;
    let usk = UnifiedSpendingKey::from_seed(&network, &seed, account)
        .map_err(|e| anyhow!("could not derive a spending key: {e}"))?;
    let ufvk = usk.to_unified_full_viewing_key();

    // SHIELDED rather than ALLOW_ALL deliberately: a tender address must not
    // carry a transparent receiver. A bidder whose wallet chose the transparent
    // path would publish their own payment on a public ledger and deanonymise
    // themselves, which is exactly the failure this project exists to prevent.
    let (address, _) = ufvk
        .default_address(UnifiedAddressRequest::SHIELDED)
        .map_err(|e| anyhow!("could not derive an address: {e}"))?;

    println!("# keep the seed secret; it can spend");
    println!("seed    {}", hex::encode(seed));
    println!();
    println!("# the tender address bidders send their sealed bids to");
    println!("address {}", address.encode(&network));
    println!();
    println!("# published after the deadline so anyone can audit the bids");
    println!("ufvk    {}", ufvk.encode(&network));
    Ok(())
}

async fn read(network: Network, server: String, ufvk_encoded: &str, txids: &[String]) -> Result<()> {
    // A viewing key is network-scoped, so a mainnet key will not decode against
    // testnet parameters. That catches the easy mistake of mixing the two.
    let ufvk = UnifiedFullViewingKey::decode(&network, ufvk_encoded)
        .map_err(|e| anyhow!("could not decode the viewing key: {e}"))?;

    let mut ufvks = HashMap::new();
    ufvks.insert(ACCOUNT, ufvk);

    let mut client = connect(&server).await?;

    for txid_hex in txids {
        match read_memos(&network, &mut client, &ufvks, txid_hex).await {
            Ok(memos) if memos.is_empty() => {
                println!("{txid_hex}\n  no outputs this key can decrypt");
            }
            Ok(memos) => {
                for m in memos {
                    println!(
                        "{txid_hex}\n  height {}  pool {}  {} zatoshi\n  memo: {}",
                        m.height, m.pool, m.value, m.memo
                    );
                }
            }
            Err(e) => println!("{txid_hex}\n  {e:#}"),
        }
    }

    Ok(())
}

struct FoundMemo {
    height: u32,
    pool: &'static str,
    value: u64,
    memo: String,
}

async fn read_memos(
    network: &Network,
    client: &mut CompactTxStreamerClient<tonic::transport::Channel>,
    ufvks: &HashMap<u32, UnifiedFullViewingKey>,
    txid_hex: &str,
) -> Result<Vec<FoundMemo>> {
    // Txids are displayed in reverse byte order by convention, so the bytes have
    // to be flipped back before the server will recognise them.
    let mut txid_bytes = hex::decode(txid_hex).context("txid is not valid hex")?;
    if txid_bytes.len() != 32 {
        bail!("a txid must be 32 bytes, got {}", txid_bytes.len());
    }
    txid_bytes.reverse();

    let raw = client
        .get_transaction(TxFilter {
            block: None,
            index: 0,
            hash: txid_bytes,
        })
        .await
        .context("the server did not return this transaction")?
        .into_inner();

    let height = u32::try_from(raw.height).context("the server reported an implausible height")?;
    if height == 0 {
        bail!("transaction is not mined yet, so it has no fixed position in the chain");
    }
    let block_height = BlockHeight::from_u32(height);

    // The consensus branch at the mined height decides how the transaction
    // parses, so it has to be derived rather than assumed.
    let branch = BranchId::for_height(network, block_height);
    let tx = Transaction::read(&raw.data[..], branch).context("could not parse the transaction")?;

    let decrypted = decrypt_transaction(network, Some(block_height), None, &tx, ufvks);

    let mut found = Vec::new();

    for output in decrypted.sapling_outputs() {
        found.push(FoundMemo {
            height,
            pool: "sapling",
            value: output.note_value().into_u64(),
            memo: render_memo(output.memo()),
        });
    }

    for output in decrypted.orchard_outputs() {
        // Orchard outputs carry a (Note, ValuePool) pair rather than a bare
        // note, so the value comes off the note itself instead of through the
        // `note_value` helper that the Sapling specialisation provides.
        let (note, _value_pool) = output.note();
        found.push(FoundMemo {
            height,
            pool: "orchard",
            value: note.value().inner(),
            memo: render_memo(output.memo()),
        });
    }

    Ok(found)
}

/// Turn raw memo bytes into something printable.
///
/// Memos are always padded to 512 bytes, and may legitimately be empty or
/// non-text, so every case is reported rather than treated as an error.
fn render_memo(bytes: &MemoBytes) -> String {
    match Memo::try_from(bytes.clone()) {
        Ok(Memo::Text(text)) => text.to_string(),
        Ok(Memo::Empty) => "<empty>".to_string(),
        Ok(Memo::Future(_)) => "<reserved memo format>".to_string(),
        Ok(Memo::Arbitrary(data)) => format!("<{} bytes of non-text data>", data.len()),
        Err(e) => format!("<undecodable memo: {e}>"),
    }
}
