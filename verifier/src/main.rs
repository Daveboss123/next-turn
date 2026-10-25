//! Incoming-only Zcash memo reader and independent savings-round verifier.
//! Wallet signing is deliberately NOT part of this program or the website.

mod audit;
mod claim;
mod receiver;

use std::{
    collections::HashSet,
    fs,
    io::Write,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, anyhow, bail};
use audit::{Bundle, ChainMemo, Manifest, Scan};
use orchard::note_encryption::{
    DomainVersion, IronwoodVersion, NoteEncryptionDomain, OrchardVersion,
};
use serde::de::DeserializeOwned;
use zcash_client_backend::proto::service::{
    BlockId, BlockRange, ChainSpec, Empty, TxFilter,
    compact_tx_streamer_client::CompactTxStreamerClient,
};
use zcash_keys::keys::{
    UnifiedAddressRequest, UnifiedFullViewingKey, UnifiedIncomingViewingKey, UnifiedSpendingKey,
};
use zcash_note_encryption::try_note_decryption;
use zcash_primitives::transaction::{Transaction, components::sapling::zip212_enforcement};
use zcash_protocol::{
    consensus::{BlockHeight, BranchId, Network},
    memo::{Memo, MemoBytes},
};

type Client = CompactTxStreamerClient<tonic::transport::Channel>;

struct IncomingKeys {
    sapling: Option<sapling::note_encryption::PreparedIncomingViewingKey>,
    orchard: Option<orchard::keys::PreparedIncomingViewingKey>,
}

impl IncomingKeys {
    fn new(key: &UnifiedIncomingViewingKey) -> Self {
        Self {
            sapling: key.sapling().as_ref().map(|k| k.prepare()),
            orchard: key.orchard().as_ref().map(|k| k.prepare()),
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("tip") if args.len() == 3 => tip(parse_network(&args[1])?, &args[2]).await,
        Some("tip-json") if args.len() == 3 || (args.len() == 5 && args[3] == "--out") => {
            tip_json(
                parse_network(&args[1])?,
                &args[2],
                args.get(4).map(String::as_str),
            )
            .await
        }
        Some("keygen") if args.len() == 2 => keygen(parse_network(&args[1])?),
        Some("receiver-init") if args.len() == 4 && args[2] == "--out-dir" => {
            if args[1] != "test" {
                bail!("receiver-init is testnet-only");
            }
            let public = receiver::initialise(std::path::Path::new(&args[3]))?;
            println!("{}", serde_json::to_string_pretty(&public)?);
            eprintln!(
                "Dedicated testnet receiver created. Private files remain local; stdout contains only the public address. No funds sent."
            );
            Ok(())
        }
        Some("wallet") if args.len() == 2 => wallet(parse_network(&args[1])?),
        Some("incoming") if args.len() == 3 => {
            let network = parse_network(&args[1])?;
            let text = key_file(&args[2])?;
            let key = UnifiedFullViewingKey::decode(&network, &text).map_err(|_| {
                anyhow!("file does not contain a full viewing key for this network")
            })?;
            println!(
                "{}",
                key.to_unified_incoming_viewing_key()
                    .encode(&network)
                    .map_err(|_| anyhow!("could not encode incoming key"))?
            );
            Ok(())
        }
        Some("read") if args.len() >= 5 => {
            read(parse_network(&args[1])?, &args[2], &args[3], &args[4..]).await
        }
        Some("scan") if args.len() == 5 || args.len() == 6 => {
            let from = args[4]
                .parse::<u32>()
                .context("from-height must be a u32 block height")?;
            let to = args
                .get(5)
                .map(|s| s.parse::<u32>())
                .transpose()
                .context("to-height must be a u32 block height")?;
            scan(parse_network(&args[1])?, &args[2], &args[3], from, to).await
        }
        Some("check") if args.len() == 2 => {
            let bundle: Bundle = json_file(&args[1], 5_000_000)?;
            let outcome = audit::audit(&bundle)?;
            println!("{}", serde_json::to_string_pretty(&outcome)?);
            eprintln!(
                "Supplied-record check only. Imported JSON is not proof of chain completeness."
            );
            if !outcome.ok {
                std::process::exit(1);
            }
            Ok(())
        }
        Some("check-claim") if args.len() == 4 => {
            let bundle: Bundle = json_file(&args[1], 5_000_000)?;
            let challenge: claim::Challenge = json_file(&args[2], 10_000)?;
            let proof: claim::Proof = json_file(&args[3], 10_000)?;
            let valid = claim::verify(&bundle, &challenge, &proof)?;
            println!(
                "{}",
                serde_json::json!({"valid":valid,"scope":"supplied-records","notice":"Proves a winning bid key against the supplied round and expected challenge, not identity, membership or chain consensus."})
            );
            if !valid {
                std::process::exit(1);
            }
            Ok(())
        }
        Some("check-anchor") if args.len() == 5 => {
            check_anchor(&args[1], &args[2], &args[3], &args[4]).await
        }
        Some("verify") if args.len() >= 4 => {
            let (claim, output) = verify_options(&args[4..])?;
            verify(
                &args[1],
                &args[2],
                &args[3],
                claim.as_deref(),
                output.as_deref(),
            )
            .await
        }
        _ => usage(),
    }
}

fn usage() -> ! {
    eprintln!(
        "tender-verify — incoming-only Zcash round auditing\n\n\
      tip      <main|test> <server>\n\
      tip-json <main|test> <server> [--out tip.json] public, timestamped chain reading\n\
      keygen   <main|test>                     new shielded address + incoming key\n\
      receiver-init test --out-dir <new-folder> secret files locally, PUBLIC address only on stdout\n\
      wallet   <main|test>                     development-only recovery phrase\n\
      incoming <main|test> <full-key-file>      convert a legacy full key before publishing\n\
      read     <main|test> <server> <key|@file> <txid>...\n\
      scan     <main|test> <server> <key|@file> <from> [to]\n\
      verify   <server> <incoming-key-file> <round.json> [winner-hash|none] [--out audit.json]\n\
      check    <public-audit.json>             OFFLINE: supplied records, not a chain proof\n\n\
      check-claim <public-audit.json> <expected-challenge.json> <winner-proof.json>\n\n\
      check-anchor <server> <incoming-key-file> <round.json> <txid> safe testnet preflight\n\n\
      verify is testnet-only, requires the full reveal window + 5 blocks, and\n\
      fails on missing blocks or unreadable transactions. No seed is needed.\n\
      Keep seeds, recovery phrases and full viewing keys private. Publish only\n\
      the dedicated incoming key after bidding closes. --out refuses to overwrite."
    );
    std::process::exit(2);
}

fn parse_network(value: &str) -> Result<Network> {
    match value {
        "main" => Ok(Network::MainNetwork),
        "test" => Ok(Network::TestNetwork),
        _ => bail!("network must be 'main' or 'test'"),
    }
}

fn verify_options(args: &[String]) -> Result<(Option<String>, Option<String>)> {
    let mut claim = None;
    let mut output = None;
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--out" {
            if output.is_some() || i + 1 >= args.len() {
                bail!("--out needs one new output filename");
            }
            output = Some(args[i + 1].clone());
            i += 2;
        } else if claim.is_none() && (args[i] == "none" || audit::is_hex(&args[i], 64)) {
            claim = Some(args[i].clone());
            i += 1;
        } else {
            bail!("invalid verify option; use a winning commitment, 'none', or --out <file>");
        }
    }
    Ok((claim, output))
}

fn text_file(path: &str, limit: usize) -> Result<String> {
    let metadata = fs::metadata(path).context("could not inspect the requested local file")?;
    if metadata.len() > limit as u64 {
        bail!("requested local file is too large");
    }
    let bytes = fs::read(path).context("could not read the requested local file")?;
    if bytes.len() > limit {
        bail!("requested local file is too large");
    }
    let text =
        String::from_utf8(bytes).context("file must be UTF-8, not a PowerShell UTF-16 redirect")?;
    Ok(text.trim_start_matches('\u{feff}').to_string())
}

fn json_file<T: DeserializeOwned>(path: &str, limit: usize) -> Result<T> {
    // Do not echo malformed secret-bearing JSON in error messages.
    serde_json::from_str(&text_file(path, limit)?)
        .map_err(|_| anyhow!("invalid or unsupported JSON file; do not import wallet secrets"))
}

fn key_file(path: &str) -> Result<String> {
    let text = text_file(path, 10_000)?;
    for line in text.lines() {
        let words: Vec<_> = line.split_whitespace().collect();
        if words.len() == 2 && ["uivk", "ufvk"].contains(&words[0]) {
            return Ok(words[1].to_string());
        }
    }
    let trimmed = text.trim();
    if trimmed.split_whitespace().count() != 1 {
        bail!("key file must contain an incoming key, or a labelled uivk/ufvk line");
    }
    Ok(trimmed.to_string())
}

fn load_key(network: &Network, text: &str, allow_legacy: bool) -> Result<IncomingKeys> {
    let encoded = if let Some(path) = text.strip_prefix('@') {
        key_file(path)?
    } else {
        text.to_string()
    };
    let key = match UnifiedIncomingViewingKey::decode(network, &encoded) {
        Ok(key) => key,
        Err(_) if allow_legacy => {
            let full = UnifiedFullViewingKey::decode(network, &encoded)
                .map_err(|_| anyhow!("could not decode a viewing key for this network"))?;
            eprintln!(
                "Legacy full key accepted for local incoming-only reading. Do not publish it; use `incoming` to narrow it first."
            );
            full.to_unified_incoming_viewing_key()
        }
        Err(_) => bail!(
            "verify requires an incoming-only key for testnet; narrow any legacy full key with `incoming`"
        ),
    };
    if !key.has_sapling() && !key.has_orchard() {
        bail!("viewing key has no supported shielded receivers");
    }
    Ok(IncomingKeys::new(&key))
}

async fn connect(network: Network, server: &str) -> Result<Client> {
    if !server.starts_with("https://") || server.len() > 200 || server.contains(['@', '?', '#']) {
        bail!("use an HTTPS light-client URL without credentials or query parameters");
    }
    let endpoint = tonic::transport::Endpoint::from_shared(server.to_string())?
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(45))
        .tls_config(tonic::transport::ClientTlsConfig::new().with_webpki_roots())?;
    let mut client = Client::new(
        endpoint
            .connect()
            .await
            .context("could not reach the light-client server")?,
    );
    let info = client
        .get_lightd_info(Empty {})
        .await
        .context("could not confirm the server network")?
        .into_inner();
    let name = info.chain_name.to_lowercase();
    let correct = match network {
        Network::MainNetwork => ["main", "mainnet"].contains(&name.as_str()),
        Network::TestNetwork => ["test", "testnet"].contains(&name.as_str()),
    };
    if !correct {
        bail!("light-client server reports a different network");
    }
    Ok(client)
}

async fn chain_tip(client: &mut Client) -> Result<u32> {
    let height = client
        .get_latest_block(ChainSpec {})
        .await
        .context("server refused chain tip")?
        .into_inner()
        .height;
    u32::try_from(height).context("server reported an implausible height")
}

async fn tip(network: Network, server: &str) -> Result<()> {
    let mut client = connect(network, server).await?;
    println!(
        "server:  {server}\nheight:  {}",
        chain_tip(&mut client).await?
    );
    Ok(())
}

async fn tip_json(network: Network, server: &str, output: Option<&str>) -> Result<()> {
    let mut client = connect(network, server).await?;
    let block = client
        .get_latest_block(ChainSpec {})
        .await
        .context("server refused chain tip")?
        .into_inner();
    let height = u32::try_from(block.height).context("implausible chain height")?;
    if height == 0 || block.hash.len() != 32 {
        bail!("server did not return a usable chain tip hash");
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("system clock is before Unix epoch")?
        .as_secs();
    let reading = serde_json::json!({"format":"nextturn-chain-tip-v1","network":match network { Network::MainNetwork => "main", Network::TestNetwork => "test" },
        "source":server,"height":height,"blockHash":hex::encode(block.hash),"fetchedAtUnixSeconds":now});
    let json = serde_json::to_string_pretty(&reading)?;
    if let Some(path) = output {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .context("tip output must be a new file; refusing to overwrite")?;
        writeln!(file, "{json}")?;
    } else {
        println!("{json}");
    }
    Ok(())
}

fn keygen(network: Network) -> Result<()> {
    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed).context("could not obtain OS randomness")?;
    let spending = UnifiedSpendingKey::from_seed(&network, &seed, zip32::AccountId::ZERO)
        .map_err(|_| anyhow!("could not derive a spending key"))?;
    let full = spending.to_unified_full_viewing_key();
    let (address, _) = full
        .default_address(UnifiedAddressRequest::SHIELDED)
        .map_err(|_| anyhow!("could not derive a shielded-only address"))?;
    let incoming = full
        .to_unified_incoming_viewing_key()
        .encode(&network)
        .map_err(|_| anyhow!("could not encode incoming key"))?;
    println!(
        "# PRIVATE: seed can spend. Keep this output in a private file.\nseed    {}\n\n# PUBLIC: dedicated round address\naddress {}\n\n# DISCLOSE ONLY AFTER BIDDING CLOSES: incoming-only viewing key\nuivk    {incoming}",
        hex::encode(seed),
        address.encode(&network)
    );
    Ok(())
}

fn wallet(network: Network) -> Result<()> {
    let mut entropy = [0u8; 32];
    getrandom::fill(&mut entropy).context("could not obtain OS randomness")?;
    let mnemonic = bip0039::Mnemonic::<bip0039::English>::from_entropy(entropy.to_vec())
        .map_err(|_| anyhow!("could not construct development mnemonic"))?;
    let spending =
        UnifiedSpendingKey::from_seed(&network, &mnemonic.to_seed(""), zip32::AccountId::ZERO)
            .map_err(|_| anyhow!("could not derive wallet keys"))?;
    let full = spending.to_unified_full_viewing_key();
    let (address, _) = full
        .default_address(UnifiedAddressRequest::SHIELDED)
        .map_err(|_| anyhow!("could not derive shielded address"))?;
    println!(
        "# DEVELOPMENT ONLY. Keep the recovery phrase PRIVATE.\nphrase  {}\n\naddress {}\n\nuivk    {}",
        mnemonic.phrase(),
        address.encode(&network),
        full.to_unified_incoming_viewing_key()
            .encode(&network)
            .map_err(|_| anyhow!("could not encode incoming key"))?
    );
    Ok(())
}

fn txid_bytes(text: &str) -> Result<Vec<u8>> {
    if !audit::is_hex(text, 64) {
        bail!("transaction ID must be 64 lowercase hex characters");
    }
    let mut bytes = hex::decode(text)?;
    bytes.reverse();
    Ok(bytes)
}

fn displayed_txid(bytes: &[u8]) -> String {
    hex::encode(bytes.iter().rev().copied().collect::<Vec<_>>())
}

fn render_memo(bytes: &[u8; 512]) -> String {
    match MemoBytes::from_bytes(bytes)
        .ok()
        .and_then(|memo| Memo::try_from(memo).ok())
    {
        Some(Memo::Text(text)) => text.to_string(),
        Some(Memo::Empty) => "<empty>".into(),
        _ => "<non-text memo>".into(),
    }
}

fn decrypt_incoming(
    network: &Network,
    height: u32,
    tx: &Transaction,
    keys: &IncomingKeys,
) -> Vec<ChainMemo> {
    let txid = tx.txid().to_string();
    let shielded_source = tx
        .transparent_bundle()
        .is_none_or(|bundle| bundle.vin.is_empty());
    let mut records = Vec::new();
    if let (Some(bundle), Some(ivk)) = (tx.sapling_bundle(), keys.sapling.as_ref()) {
        let domain = sapling::note_encryption::SaplingDomain::new(zip212_enforcement(
            network,
            BlockHeight::from_u32(height),
        ));
        for (index, output) in bundle.shielded_outputs().iter().enumerate() {
            if let Some((note, recipient, memo)) = try_note_decryption(&domain, ivk, output) {
                records.push(ChainMemo {
                    txid: txid.clone(),
                    height,
                    pool: "sapling".into(),
                    output_index: index,
                    recipient_hex: hex::encode(recipient.to_bytes()),
                    value_zatoshis: note.value().inner().to_string(),
                    shielded_source,
                    memo: render_memo(&memo),
                });
            }
        }
    }
    if let Some(ivk) = keys.orchard.as_ref() {
        if let Some(bundle) = tx.orchard_bundle() {
            decrypt_orchard::<OrchardVersion>(
                bundle,
                ivk,
                "orchard",
                &txid,
                height,
                shielded_source,
                &mut records,
            );
        }
        if let Some(bundle) = tx.ironwood_bundle() {
            decrypt_orchard::<IronwoodVersion>(
                bundle,
                ivk,
                "ironwood",
                &txid,
                height,
                shielded_source,
                &mut records,
            );
        }
    }
    records
}

fn decrypt_orchard<V: DomainVersion>(
    bundle: &orchard::bundle::Bundle<
        orchard::bundle::Authorized,
        zcash_protocol::value::ZatBalance,
    >,
    ivk: &orchard::keys::PreparedIncomingViewingKey,
    pool: &str,
    txid: &str,
    height: u32,
    shielded_source: bool,
    records: &mut Vec<ChainMemo>,
) {
    for (index, action) in bundle.actions().iter().enumerate() {
        let domain = NoteEncryptionDomain::<V>::for_action(action);
        if let Some((note, recipient, memo)) = try_note_decryption(&domain, ivk, action) {
            records.push(ChainMemo {
                txid: txid.to_string(),
                height,
                pool: pool.to_string(),
                output_index: index,
                recipient_hex: hex::encode(recipient.to_raw_address_bytes()),
                value_zatoshis: note.value().inner().to_string(),
                shielded_source,
                memo: render_memo(&memo),
            });
        }
    }
}

async fn fetch_and_decrypt(
    network: &Network,
    client: &mut Client,
    keys: &IncomingKeys,
    txid: &[u8],
    expected_height: Option<u32>,
) -> Result<Vec<ChainMemo>> {
    if txid.len() != 32 {
        bail!("server supplied an invalid transaction ID");
    }
    let raw = client
        .get_transaction(TxFilter {
            block: None,
            index: 0,
            hash: txid.to_vec(),
        })
        .await
        .context("server did not return a full transaction")?
        .into_inner();
    let height = u32::try_from(raw.height).context("transaction height is implausible")?;
    if height == 0 || expected_height.is_some_and(|expected| expected != height) {
        bail!("transaction is unmined or its height disagrees with the compact block");
    }
    let branch = BranchId::for_height(network, BlockHeight::from_u32(height));
    let tx = Transaction::read(&raw.data[..], branch)
        .context("could not parse transaction for this consensus branch")?;
    if tx.txid().to_string() != displayed_txid(txid) {
        bail!("returned transaction does not match the requested ID");
    }
    Ok(decrypt_incoming(network, height, &tx, keys))
}

fn print_records(records: &[ChainMemo]) {
    for record in records {
        println!(
            "{}\n  height {}  pool {}  output {}  {} zatoshi\n  memo: {}",
            record.txid,
            record.height,
            record.pool,
            record.output_index,
            record.value_zatoshis,
            record.memo
        );
    }
}

async fn read(network: Network, server: &str, encoded: &str, txids: &[String]) -> Result<()> {
    let keys = load_key(&network, encoded, true)?;
    let mut client = connect(network, server).await?;
    let mut failed = false;
    for txid in txids {
        match fetch_and_decrypt(&network, &mut client, &keys, &txid_bytes(txid)?, None).await {
            Ok(records) if records.is_empty() => {
                println!("{txid}\n  no incoming outputs this key can decrypt")
            }
            Ok(records) => print_records(&records),
            Err(error) => {
                eprintln!("{txid}\n  {error:#}");
                failed = true;
            }
        }
    }
    if failed {
        bail!("one or more transactions could not be read; this is not a complete audit");
    }
    Ok(())
}

async fn check_anchor(
    server: &str,
    incoming_file: &str,
    round_file: &str,
    txid: &str,
) -> Result<()> {
    let network = Network::TestNetwork;
    let mut manifest: Manifest = json_file(round_file, 50_000)?;
    audit::validate_manifest(&manifest)?;
    if manifest.rules.network != "test" {
        bail!("check-anchor is testnet-only");
    }
    let bytes = txid_bytes(txid)?;
    if manifest
        .anchor_txid
        .as_deref()
        .is_some_and(|known| known != txid)
    {
        bail!("this transaction is not the anchor named in the round file");
    }
    manifest.anchor_txid = Some(txid.to_string());
    let expected = audit::receivers(&manifest.rules)?;
    let keys = load_key(&network, &format!("@{incoming_file}"), false)?;
    let mut client = connect(network, server).await?;
    let records = fetch_and_decrypt(&network, &mut client, &keys, &bytes, None).await?;
    let valid = records
        .iter()
        .any(|record| audit::is_valid_anchor(&manifest, record, &expected));
    // Never export an unexpected memo, viewing key or private bid field.
    let outputs: Vec<_> = records.iter().map(|record| serde_json::json!({
        "height":record.height, "pool":record.pool, "outputIndex":record.output_index,
        "recipientMatches":audit::matches_recipient(record, &expected),
        "fixedPaymentMatches":record.value_zatoshis == manifest.rules.submission_zatoshis,
        "shieldedSource":record.shielded_source,
        "onTime":record.height < manifest.rules.start_height,
        "rulesMemoMatches":matches!(audit::parse_memo(&record.memo), Some(audit::Memo::Anchor { tender_id, rules_hash })
            if tender_id == manifest.rules.tender_id && rules_hash == manifest.rules_hash)
    })).collect();
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "valid":valid,"scope":"retrieved-transaction","txid":txid,"source":server,
            "rulesHash":manifest.rules_hash,"startHeight":manifest.rules.start_height,"outputs":outputs,
            "notice":"Checks this retrieved anchor only, not the full round or full-node consensus. No key or unexpected memo is printed."
        }))?
    );
    if !valid {
        std::process::exit(1);
    }
    Ok(())
}

/// Full-range retrieval, fail-closed. No skipped blocks or unreadable candidates
/// can silently turn into a 'verified' missing-bid outcome.
async fn scan_records(
    network: &Network,
    client: &mut Client,
    keys: &IncomingKeys,
    from: u32,
    to: u32,
) -> Result<Vec<ChainMemo>> {
    if from == 0
        || to < from
        || to == u32::MAX
        || u64::from(to) - u64::from(from) + 1 > audit::MAX_BLOCKS
    {
        bail!("use an increasing range of at most 20,000 blocks");
    }
    eprintln!("scanning blocks {from}..={to}");
    let mut stream = client
        .get_block_range(BlockRange {
            start: Some(BlockId {
                height: u64::from(from),
                hash: vec![],
            }),
            end: Some(BlockId {
                height: u64::from(to),
                hash: vec![],
            }),
            pool_types: vec![],
        })
        .await
        .context("server refused block range")?
        .into_inner();
    let mut expected = from;
    let mut previous_hash: Option<Vec<u8>> = None;
    let mut candidates = Vec::new();
    let mut txids = HashSet::new();
    while let Some(block) = stream
        .message()
        .await
        .context("block stream failed; scan incomplete")?
    {
        if block.height != u64::from(expected) || block.hash.len() != 32 {
            bail!("missing, out-of-order, or unhashed block; scan incomplete");
        }
        if previous_hash
            .as_ref()
            .is_some_and(|hash| hash != &block.prev_hash)
        {
            bail!("block hashes do not link; possible reorganisation or incomplete stream");
        }
        previous_hash = Some(block.hash);
        expected += 1;
        for tx in block.vtx {
            if tx.outputs.is_empty() && tx.actions.is_empty() && tx.ironwood_actions.is_empty() {
                continue;
            }
            if tx.txid.len() != 32 || !txids.insert(tx.txid.clone()) {
                bail!("invalid or duplicate transaction ID in block stream");
            }
            candidates.push((tx.txid, block.height as u32));
            if candidates.len() > 100_000 {
                bail!("too many shielded transactions; narrow the scan window");
            }
        }
    }
    if expected != to + 1 {
        bail!("server omitted blocks; scan incomplete");
    }
    eprintln!(
        "{} blocks read, {} shielded transactions to check",
        to - from + 1,
        candidates.len()
    );
    let mut records = Vec::new();
    for (txid, height) in candidates {
        records.extend(
            fetch_and_decrypt(network, client, keys, &txid, Some(height))
                .await
                .context("could not read every candidate; scan incomplete")?,
        );
        if records.len() > 10_000 {
            bail!("too many incoming outputs for a local audit");
        }
    }
    let final_block = client
        .get_block(BlockId {
            height: u64::from(to),
            hash: vec![],
        })
        .await
        .context("could not recheck the scan boundary")?
        .into_inner();
    if final_block.height != u64::from(to) || Some(final_block.hash) != previous_hash {
        bail!("chain changed during scan; discard this audit and retry");
    }
    Ok(records)
}

async fn scan(
    network: Network,
    server: &str,
    encoded: &str,
    from: u32,
    to: Option<u32>,
) -> Result<()> {
    let keys = load_key(&network, encoded, true)?;
    let mut client = connect(network, server).await?;
    let tip = chain_tip(&mut client).await?;
    let to = to.unwrap_or(tip).min(tip);
    let records = scan_records(&network, &mut client, &keys, from, to).await?;
    print_records(&records);
    let total: u128 = records
        .iter()
        .map(|record| {
            record
                .value_zatoshis
                .parse::<u128>()
                .expect("decoded note value")
        })
        .sum();
    let whole = total / 100_000_000;
    let fraction = total % 100_000_000;
    println!(
        "\n{} incoming output(s)\ntotal received {whole}.{fraction:08} ZEC (not a spendable-balance calculation)",
        records.len()
    );
    Ok(())
}

async fn verify(
    server: &str,
    key_path: &str,
    round_path: &str,
    claim: Option<&str>,
    output: Option<&str>,
) -> Result<()> {
    let manifest: Manifest = json_file(round_path, 50_000)?;
    audit::validate_manifest(&manifest)?;
    if manifest.rules.network != "test" {
        bail!("independent verify is testnet-only; use check for simulated records");
    }
    let network = Network::TestNetwork;
    let keys = load_key(&network, &key_file(key_path)?, false)?;
    let mut client = connect(network, server).await?;
    if chain_tip(&mut client).await? < manifest.rules.reveal_deadline_height + audit::CONFIRMATIONS
    {
        bail!("round is not final; wait for reveal close and five additional blocks");
    }
    let anchor_txid = manifest
        .anchor_txid
        .as_ref()
        .context("round is still a draft: no anchor transaction ID")?;
    let expected = audit::receivers(&manifest.rules)?;
    let anchor_outputs = fetch_and_decrypt(
        &network,
        &mut client,
        &keys,
        &txid_bytes(anchor_txid)?,
        None,
    )
    .await?;
    let anchor = anchor_outputs
        .iter()
        .find(|record| audit::is_valid_anchor(&manifest, record, &expected))
        .context(
            "incoming key did not decrypt the advertised on-time rules anchor at the round address",
        )?;
    let from = anchor.height;
    let to = manifest.rules.reveal_deadline_height;
    let mut records = scan_records(&network, &mut client, &keys, from, to).await?;
    // Do not export unrelated text, identities in spam memos, or other round
    // addresses that happen to belong to this incoming key.
    records.retain(|record| {
        audit::matches_recipient(record, &expected)
            && audit::parse_memo(&record.memo)
                .is_some_and(|memo| memo.tender_id() == manifest.rules.tender_id)
    });
    let tip = chain_tip(&mut client).await?;
    if tip < to + audit::CONFIRMATIONS {
        bail!("confirmation depth changed during scan; retry later");
    }
    let bundle = Bundle {
        format: "sealed-tender-audit-v1".into(),
        scan: Scan {
            network: "test".into(),
            source: server.into(),
            from_height: from,
            to_height: to,
            tip_height: tip,
            complete: true,
            records,
        },
        manifest,
        declared_winner_commitment: claim.map(|value| {
            if value == "none" {
                None
            } else {
                Some(value.into())
            }
        }),
    };
    let outcome = audit::audit(&bundle)?;
    let json = serde_json::to_string_pretty(&bundle)?;
    if let Some(path) = output {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .context("could not create audit file; --out refuses to overwrite existing files")?;
        writeln!(file, "{json}")?;
        eprintln!("public audit written to {path}");
    } else {
        println!("{json}");
    }
    eprintln!(
        "{}: {} valid revealed bid(s). Independent retrieval from a light-client server, not full-node consensus validation.",
        if outcome.ok { "PASS" } else { "FAIL" },
        outcome
            .bids
            .iter()
            .filter(|bid| bid.status == "valid")
            .count()
    );
    if let Some(winner) = &outcome.winner {
        eprintln!(
            "winner commitment: {}\ndiscount minor units: {}",
            winner.commitment_hex,
            winner.price_minor.as_deref().unwrap_or("none")
        );
    }
    for error in &outcome.errors {
        eprintln!("{}: {}", error.code, error.message);
    }
    if !outcome.ok {
        std::process::exit(1);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn new_keys_are_incoming_only_and_shielded() {
        let network = Network::TestNetwork;
        let spending =
            UnifiedSpendingKey::from_seed(&network, &[7u8; 32], zip32::AccountId::ZERO).unwrap();
        let full = spending.to_unified_full_viewing_key();
        let incoming = full.to_unified_incoming_viewing_key();
        let encoded = incoming.encode(&network).unwrap();
        assert!(encoded.starts_with("uivktest1"));
        assert!(load_key(&network, &encoded, false).is_ok());
        assert!(load_key(&network, &full.encode(&network).unwrap(), false).is_err());
        let (address, _) = full
            .default_address(UnifiedAddressRequest::SHIELDED)
            .unwrap();
        assert!(!address.has_transparent());
    }
    #[test]
    fn txid_and_options_are_strict() {
        assert!(txid_bytes("secret").is_err());
        assert_eq!(
            displayed_txid(&txid_bytes(&"ab".repeat(32)).unwrap()),
            "ab".repeat(32)
        );
        assert!(verify_options(&["--out".into()]).is_err());
        assert!(verify_options(&["--unexpected".into()]).is_err());
    }
}
