//! Reads sealed tender bids out of the Zcash chain using a view-only key.
//!
//! This is the one part of Sealed Tender that needs real Zcash cryptography.
//! Everything a bidder touches is plain browser code; only *reading* the sealed
//! bids back off the chain requires note decryption, which happens here.
//!
//! Why this is a command-line tool rather than a web page: an auditor who has to
//! trust our website to tell them the website is honest has gained nothing. This
//! binary takes a published viewing key and talks straight to a public Zcash
//! light-client server, so anyone can reconstruct a tender without our
//! involvement.
//!
//! Commands:
//!   tender-verify tip    <main|test> <server>
//!   tender-verify keygen <main|test>
//!   tender-verify read   <main|test> <server> <ufvk> <txid>...
//!   tender-verify scan   <main|test> <server> <ufvk> <from-height> [to-height]

use std::collections::HashMap;

use anyhow::{Context, Result, anyhow, bail};
use zcash_client_backend::decrypt_transaction;
use zcash_client_backend::proto::service::{
    BlockId, BlockRange, ChainSpec, TxFilter, compact_tx_streamer_client::CompactTxStreamerClient,
};
use zcash_keys::keys::{UnifiedAddressRequest, UnifiedFullViewingKey, UnifiedSpendingKey};
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::{BlockHeight, BranchId, Network};
use zcash_protocol::memo::{Memo, MemoBytes};

/// Only ever one key is used per run, so the account id is a constant.
const ACCOUNT: u32 = 0;

/// Guard against accidentally asking for the whole chain. Scanning is the
/// expensive path, and a typo in a height should not turn into a million
/// requests against a public server someone else pays for.
const MAX_SCAN_BLOCKS: u64 = 20_000;

type Client = CompactTxStreamerClient<tonic::transport::Channel>;

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        usage();
    }

    match args[0].as_str() {
        "tip" if args.len() == 3 => tip(args[2].clone()).await,
        "keygen" if args.len() == 2 => keygen(parse_network(&args[1])?),
        "read" if args.len() >= 5 => {
            read(parse_network(&args[1])?, args[2].clone(), &args[3], &args[4..]).await
        }
        "scan" if args.len() == 5 || args.len() == 6 => {
            let from = args[4].parse::<u64>().context("from-height must be a number")?;
            let to = match args.get(5) {
                Some(s) => Some(s.parse::<u64>().context("to-height must be a number")?),
                None => None,
            };
            scan(parse_network(&args[1])?, args[2].clone(), &args[3], from, to).await
        }
        _ => usage(),
    }
}

fn usage() -> ! {
    eprintln!(
        "tender-verify - read sealed tender bids from the Zcash chain\n\n\
         commands:\n  \
         tip    <main|test> <server>                                 check the server is reachable\n  \
         keygen <main|test>                                          make a tender address and viewing key\n  \
         read   <main|test> <server> <ufvk> <txid>...                decrypt specific transactions\n  \
         scan   <main|test> <server> <ufvk> <from> [to]              find every bid in a height range\n\n\
         example:\n  \
         tender-verify scan test https://testnet.zec.rocks:443 uviewtest1... 4503000"
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

async fn connect(server: &str) -> Result<Client> {
    CompactTxStreamerClient::connect(server.to_string())
        .await
        .with_context(|| format!("could not reach the light-client server at {server}"))
}

fn load_ufvk(network: &Network, encoded: &str) -> Result<HashMap<u32, UnifiedFullViewingKey>> {
    // A viewing key is network-scoped, so a mainnet key will not decode against
    // testnet parameters. That catches the easy mistake of mixing the two.
    let ufvk = UnifiedFullViewingKey::decode(network, encoded)
        .map_err(|e| anyhow!("could not decode the viewing key: {e}"))?;
    let mut ufvks = HashMap::new();
    ufvks.insert(ACCOUNT, ufvk);
    Ok(ufvks)
}

/// Smoke test: ask the server for the current chain tip.
///
/// Worth having as its own command because it separates "the network is broken"
/// from "the key is wrong", which otherwise look identical at the call site.
async fn tip(server: String) -> Result<()> {
    let mut client = connect(&server).await?;
    let block = chain_tip(&mut client).await?;

    println!("server:  {server}");
    println!("height:  {}", block);
    Ok(())
}

async fn chain_tip(client: &mut Client) -> Result<u64> {
    Ok(client
        .get_latest_block(ChainSpec {})
        .await
        .context("the server refused the request")?
        .into_inner()
        .height)
}

/// Generate a fresh tender address plus the viewing key that reads it.
///
/// Note on what gets published later: this prints the *full* viewing key, which
/// also carries outgoing-view capability. A tender should publish only the
/// incoming viewing key, so that disclosing the bid set does not also expose the
/// organiser's own spends from that address. Narrowing this is a known todo and
/// is recorded in the README rather than quietly glossed over.
fn keygen(network: Network) -> Result<()> {
    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed).context("could not get randomness from the operating system")?;

    let usk = UnifiedSpendingKey::from_seed(&network, &seed, zip32::AccountId::ZERO)
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
    println!(
        "ufvk    {}",
        ufvk.encode(&network)
            .map_err(|e| anyhow!("could not encode the viewing key: {e}"))?
    );
    Ok(())
}

/// Decrypt transactions whose ids are already known.
async fn read(network: Network, server: String, ufvk: &str, txids: &[String]) -> Result<()> {
    let ufvks = load_ufvk(&network, ufvk)?;
    let mut client = connect(&server).await?;

    for txid_hex in txids {
        // Txids are displayed in reverse byte order by convention, so the bytes
        // have to be flipped back before the server will recognise them.
        let mut bytes = hex::decode(txid_hex).context("txid is not valid hex")?;
        if bytes.len() != 32 {
            bail!("a txid must be 32 bytes, got {}", bytes.len());
        }
        bytes.reverse();

        match fetch_and_decrypt(&network, &mut client, &ufvks, &bytes).await {
            Ok(found) if found.is_empty() => println!("{txid_hex}\n  no outputs this key can decrypt"),
            Ok(found) => print_found(&found),
            Err(e) => println!("{txid_hex}\n  {e:#}"),
        }
    }
    Ok(())
}

/// Walk a range of blocks and decrypt everything the key can see.
///
/// This is what backs the claim that an organiser cannot hide a bid: given the
/// published viewing key, the full set of submissions is recoverable from the
/// chain by anyone, independently of whatever the organiser chooses to display.
async fn scan(
    network: Network,
    server: String,
    ufvk: &str,
    from: u64,
    to: Option<u64>,
) -> Result<()> {
    let ufvks = load_ufvk(&network, ufvk)?;
    let mut client = connect(&server).await?;

    let to = match to {
        Some(t) => t,
        None => chain_tip(&mut client).await?,
    };
    if to < from {
        bail!("to-height {to} is below from-height {from}");
    }
    let span = to - from + 1;
    if span > MAX_SCAN_BLOCKS {
        bail!("that range is {span} blocks; narrow it to {MAX_SCAN_BLOCKS} or fewer");
    }

    eprintln!("scanning blocks {from}..={to} ({span} blocks)");

    // Compact blocks are fetched first because they are small and tell us which
    // transactions even have shielded outputs. Only those are then fetched in
    // full, since a memo is not present in the compact form - the note
    // ciphertext there is truncated to just enough for detection.
    let mut candidates: Vec<Vec<u8>> = Vec::new();
    let mut blocks_seen = 0u64;

    let mut stream = client
        .get_block_range(BlockRange {
            start: Some(BlockId { height: from, hash: vec![] }),
            end: Some(BlockId { height: to, hash: vec![] }),
            // Empty means "every pool"; we must not filter, because a bid could
            // arrive in either the Sapling or the Orchard pool.
            pool_types: vec![],
        })
        .await
        .context("the server refused the block range request")?
        .into_inner();

    while let Some(block) = stream
        .message()
        .await
        .context("the block stream failed partway through")?
    {
        blocks_seen += 1;
        for ctx in block.vtx {
            if ctx.outputs.is_empty() && ctx.actions.is_empty() {
                continue; // nothing shielded in this transaction
            }
            // Already in protocol byte order, which is what GetTransaction
            // expects, so unlike a txid typed by a human this needs no reversal.
            candidates.push(ctx.txid);
        }
    }

    eprintln!(
        "{blocks_seen} blocks read, {} shielded transactions to check",
        candidates.len()
    );

    let mut total = 0u64;
    let mut hits = 0usize;

    for txid in &candidates {
        match fetch_and_decrypt(&network, &mut client, &ufvks, txid).await {
            Ok(found) if found.is_empty() => {}
            Ok(found) => {
                hits += 1;
                total += found.iter().map(|f| f.value).sum::<u64>();
                print_found(&found);
            }
            // A single unreadable transaction must not abort an audit.
            Err(e) => eprintln!("  skipped a transaction: {e:#}"),
        }
    }

    println!();
    println!("{hits} transaction(s) for this key");
    println!("total {total} zatoshi ({} ZEC)", format_zec(total));
    Ok(())
}

struct FoundMemo {
    txid: String,
    height: u32,
    pool: &'static str,
    value: u64,
    memo: String,
}

fn print_found(found: &[FoundMemo]) {
    for f in found {
        println!(
            "{}\n  height {}  pool {}  {} zatoshi\n  memo: {}",
            f.txid, f.height, f.pool, f.value, f.memo
        );
    }
}

/// Render zatoshis as ZEC without floating point.
fn format_zec(zatoshis: u64) -> String {
    let whole = zatoshis / 100_000_000;
    let frac = zatoshis % 100_000_000;
    if frac == 0 {
        whole.to_string()
    } else {
        format!("{whole}.{:08}", frac).trim_end_matches('0').to_string()
    }
}

/// Fetch one transaction by its internal-order txid and decrypt its outputs.
async fn fetch_and_decrypt(
    network: &Network,
    client: &mut Client,
    ufvks: &HashMap<u32, UnifiedFullViewingKey>,
    txid_internal: &[u8],
) -> Result<Vec<FoundMemo>> {
    let raw = client
        .get_transaction(TxFilter {
            block: None,
            index: 0,
            hash: txid_internal.to_vec(),
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
    let txid = tx.txid().to_string();

    let decrypted = decrypt_transaction(network, Some(block_height), None, &tx, ufvks);

    let mut found = Vec::new();

    for output in decrypted.sapling_outputs() {
        found.push(FoundMemo {
            txid: txid.clone(),
            height,
            pool: "sapling",
            value: output.note_value().into_u64(),
            memo: render_memo(output.memo()),
        });
    }

    for output in decrypted.orchard_outputs() {
        // Orchard outputs carry a (Note, ValuePool) pair rather than a bare
        // note, so the value comes off the note itself instead of through the
        // `note_value` helper the Sapling specialisation provides.
        let (note, _value_pool) = output.note();
        found.push(FoundMemo {
            txid: txid.clone(),
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
/// Memos are always padded to 512 bytes and may legitimately be empty or
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
