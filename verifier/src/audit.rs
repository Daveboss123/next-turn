//! Deterministic round verification. No wallet keys or network logic here.
//! JSON alone is not a chain proof: main.rs supplies freshly retrieved records.

use std::collections::{HashMap, HashSet};

use anyhow::{Result, bail};
use serde::{Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};
use zcash_keys::address::{Address, UnifiedAddress};
use zcash_protocol::consensus::Network;

pub const MAX_BLOCKS: u64 = 20_000;
pub const CONFIRMATIONS: u32 = 5;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rules {
    pub version: u8,
    pub tender_id: String,
    pub network: String,
    pub address: String,
    pub title: String,
    pub currency: String,
    pub pot_minor: String,
    pub member_count: u32,
    pub discount_cap_bps: u32,
    pub start_height: u32,
    pub commit_deadline_height: u32,
    pub reveal_deadline_height: u32,
    pub submission_zatoshis: String,
    pub tie_break: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub format: String,
    pub rules: Rules,
    pub rules_hash: String,
    pub anchor_txid: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChainMemo {
    pub txid: String,
    pub height: u32,
    pub pool: String,
    pub output_index: usize,
    pub recipient_hex: String,
    pub value_zatoshis: String,
    pub shielded_source: bool,
    pub memo: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scan {
    pub network: String,
    pub source: String,
    pub from_height: u32,
    pub to_height: u32,
    pub tip_height: u32,
    pub complete: bool,
    pub records: Vec<ChainMemo>,
}

fn present_optional<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(deserializer).map(Some)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bundle {
    pub format: String,
    pub manifest: Manifest,
    pub scan: Scan,
    #[serde(
        default,
        deserialize_with = "present_optional",
        skip_serializing_if = "Option::is_none"
    )]
    pub declared_winner_commitment: Option<Option<String>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bid {
    pub commitment_hex: String,
    pub commit_height: u32,
    pub reveal_height: Option<u32>,
    pub price_minor: Option<String>,
    pub status: &'static str,
    pub claim_public_key_hex: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Issue {
    pub code: &'static str,
    pub message: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub txid: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Outcome {
    pub ok: bool,
    pub scope: &'static str,
    pub winner: Option<Bid>,
    pub bids: Vec<Bid>,
    pub errors: Vec<Issue>,
    pub rejected: Vec<Issue>,
    pub ignored: usize,
    pub claim: &'static str,
}

pub fn is_hex(value: &str, size: usize) -> bool {
    value.len() == size
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn minor(value: &str) -> Option<u64> {
    if value.is_empty()
        || value.len() > 18
        || !value.bytes().all(|b| b.is_ascii_digit())
        || (value.len() > 1 && value.starts_with('0'))
    {
        return None;
    }
    value.parse().ok()
}

fn height(value: u32) -> bool {
    value > 0 && value <= u32::MAX - CONFIRMATIONS
}

pub fn sha256(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

pub fn rules_preimage(r: &Rules) -> String {
    serde_json::json!([
        "ZTENDER-RULES-v1",
        r.version,
        r.tender_id,
        r.network,
        r.address,
        r.title,
        r.currency,
        r.pot_minor,
        r.member_count,
        r.discount_cap_bps,
        r.start_height,
        r.commit_deadline_height,
        r.reveal_deadline_height,
        r.submission_zatoshis,
        r.tie_break
    ])
    .to_string()
}

pub fn commitment(tender_id: &str, rules_hash: &str, price: &str, salt: &str) -> String {
    sha256(&format!(
        "ZTENDER-ROUND-v1:{rules_hash}:{tender_id}:{price}:{salt}"
    ))
}

pub fn claimed_commitment(
    tender_id: &str,
    rules_hash: &str,
    price: &str,
    salt: &str,
    public_key: &str,
) -> String {
    sha256(&format!(
        "ZTENDER-ROUND-CLAIM-v1:{rules_hash}:{tender_id}:{price}:{salt}:{public_key}"
    ))
}

/// Receiver matching avoids counting another diversified address belonging to
/// the same key. Unknown formats fail closed, matching the browser's R0 scope.
pub fn receivers(r: &Rules) -> Result<Option<(Option<String>, Option<String>)>> {
    if r.network == "practice" {
        return Ok(None);
    }
    if !r.address.starts_with("utest1") && !r.address.starts_with("ztestsapling1") {
        bail!("use a lowercase R0 shielded testnet address");
    }
    match Address::decode(&Network::TestNetwork, &r.address) {
        Some(Address::Sapling(address)) => Ok(Some((Some(hex::encode(address.to_bytes())), None))),
        Some(Address::Unified(address))
            if !address.has_transparent()
                && address.unknown().is_empty()
                && address.expiry_height().is_none()
                && address.expiry_time().is_none() =>
        {
            let known = UnifiedAddress::from_receivers(
                address.orchard().cloned(),
                address.sapling().cloned(),
                None,
                None,
                None,
            )
            .ok_or_else(|| anyhow::anyhow!("no supported shielded receiver"))?;
            if known.encode(&Network::TestNetwork) != r.address {
                bail!("unsupported address metadata or non-canonical encoding");
            }
            Ok(Some((
                address.sapling().map(|a| hex::encode(a.to_bytes())),
                address
                    .orchard()
                    .map(|a| hex::encode(a.to_raw_address_bytes())),
            )))
        }
        _ => bail!("invalid, unsupported or transparent-including round address"),
    }
}

pub fn validate_manifest(manifest: &Manifest) -> Result<()> {
    let r = &manifest.rules;
    if manifest.format != "sealed-tender-round-v1"
        || !is_hex(&manifest.rules_hash, 64)
        || manifest
            .anchor_txid
            .as_ref()
            .is_some_and(|txid| !is_hex(txid, 64))
    {
        bail!("invalid round manifest format or hashes");
    }
    if ![1, 2].contains(&r.version)
        || !is_hex(&r.tender_id, 16)
        || !["practice", "test"].contains(&r.network.as_str())
        || r.title.is_empty()
        || r.title.encode_utf16().count() > 80
        || r.title.trim() != r.title
        || r.title.chars().any(|c| c as u32 <= 31 || c == '\u{7f}')
        || r.currency.len() != 3
        || !r.currency.bytes().all(|b| b.is_ascii_uppercase())
        || minor(&r.pot_minor).is_none_or(|amount| amount == 0)
        || !(2..=100).contains(&r.member_count)
        || !(1..=10_000).contains(&r.discount_cap_bps)
        || !height(r.start_height)
        || !height(r.commit_deadline_height)
        || !height(r.reveal_deadline_height)
        || r.start_height >= r.commit_deadline_height
        || r.commit_deadline_height >= r.reveal_deadline_height
        || u64::from(r.reveal_deadline_height) - u64::from(r.start_height) + 1 > MAX_BLOCKS - 100
        || r.submission_zatoshis != "100000"
        || r.tie_break != "earliest-block-then-commitment"
    {
        bail!("invalid or unsupported round rules");
    }
    if r.network == "practice" && r.address != "local-practice-only" {
        bail!("practice cannot use a real address");
    }
    receivers(r)?;
    if sha256(&rules_preimage(r)) != manifest.rules_hash {
        bail!("rules fingerprint mismatch: the round file has changed");
    }
    Ok(())
}

pub enum Memo<'a> {
    Anchor {
        tender_id: &'a str,
        rules_hash: &'a str,
    },
    Commit {
        tender_id: &'a str,
        rules_hash: &'a str,
        hash: &'a str,
        claim_public_key: Option<&'a str>,
    },
    Reveal {
        tender_id: &'a str,
        rules_hash: &'a str,
        price: &'a str,
        salt: &'a str,
        claim_public_key: Option<&'a str>,
    },
}

impl<'a> Memo<'a> {
    pub fn tender_id(&self) -> &str {
        match self {
            Self::Anchor { tender_id, .. }
            | Self::Commit { tender_id, .. }
            | Self::Reveal { tender_id, .. } => tender_id,
        }
    }
    pub fn claim_key(&self) -> Option<&'a str> {
        match self {
            Self::Anchor { .. } => None,
            Self::Commit {
                claim_public_key, ..
            }
            | Self::Reveal {
                claim_public_key, ..
            } => *claim_public_key,
        }
    }
}

pub fn parse_memo(value: &str) -> Option<Memo<'_>> {
    if value.len() > 512 {
        return None;
    }
    let parts: Vec<_> = value.trim_end_matches('\0').trim().split(' ').collect();
    match parts.as_slice() {
        ["ZT3C", id, rules, hash, public_key]
            if is_hex(id, 16)
                && [*rules, *hash, *public_key]
                    .iter()
                    .all(|field| is_hex(field, 64)) =>
        {
            Some(Memo::Commit {
                tender_id: id,
                rules_hash: rules,
                hash,
                claim_public_key: Some(public_key),
            })
        }
        ["ZT3R", id, rules, price, salt, public_key]
            if is_hex(id, 16)
                && minor(price).is_some()
                && [*rules, *salt, *public_key]
                    .iter()
                    .all(|field| is_hex(field, 64)) =>
        {
            Some(Memo::Reveal {
                tender_id: id,
                rules_hash: rules,
                price,
                salt,
                claim_public_key: Some(public_key),
            })
        }
        ["ZT1A", id, hash] if is_hex(id, 16) && is_hex(hash, 64) => Some(Memo::Anchor {
            tender_id: id,
            rules_hash: hash,
        }),
        ["ZT2C", id, rules, hash] if is_hex(id, 16) && is_hex(rules, 64) && is_hex(hash, 64) => {
            Some(Memo::Commit {
                tender_id: id,
                rules_hash: rules,
                hash,
                claim_public_key: None,
            })
        }
        ["ZT2R", id, rules, price, salt]
            if is_hex(id, 16)
                && is_hex(rules, 64)
                && minor(price).is_some()
                && is_hex(salt, 64) =>
        {
            Some(Memo::Reveal {
                tender_id: id,
                rules_hash: rules,
                price,
                salt,
                claim_public_key: None,
            })
        }
        _ => None,
    }
}

pub fn matches_recipient(
    record: &ChainMemo,
    expected: &Option<(Option<String>, Option<String>)>,
) -> bool {
    match expected {
        None => record.pool == "practice" && record.recipient_hex == "practice",
        Some((sapling, orchard)) => {
            let receiver = if record.pool == "sapling" {
                sapling
            } else {
                orchard
            };
            receiver.as_ref() == Some(&record.recipient_hex)
        }
    }
}

/// Same anchor policy for offline audit, single-transaction preflight and full retrieval.
pub fn is_valid_anchor(
    manifest: &Manifest,
    record: &ChainMemo,
    expected: &Option<(Option<String>, Option<String>)>,
) -> bool {
    manifest.anchor_txid.as_ref() == Some(&record.txid)
        && matches_recipient(record, expected)
        && height(record.height)
        && record.shielded_source
        && record.value_zatoshis == manifest.rules.submission_zatoshis
        && record.height < manifest.rules.start_height
        && matches!(parse_memo(&record.memo), Some(Memo::Anchor { tender_id, rules_hash })
            if tender_id == manifest.rules.tender_id && rules_hash == manifest.rules_hash)
}

fn issue(code: &'static str, message: &'static str, txid: Option<&str>) -> Issue {
    Issue {
        code,
        message,
        txid: txid.map(String::from),
    }
}

pub fn audit(bundle: &Bundle) -> Result<Outcome> {
    validate_manifest(&bundle.manifest)?;
    let r = &bundle.manifest.rules;
    let s = &bundle.scan;
    if bundle.format != "sealed-tender-audit-v1"
        || s.network != r.network
        || s.source.len() > 200
        || !height(s.from_height)
        || !height(s.to_height)
        || !height(s.tip_height)
        || s.from_height > s.to_height
        || s.to_height > s.tip_height
        || u64::from(s.to_height) - u64::from(s.from_height) + 1 > MAX_BLOCKS
        || s.records.len() > 10_000
        || bundle
            .declared_winner_commitment
            .as_ref()
            .and_then(|v| v.as_ref())
            .is_some_and(|v| !is_hex(v, 64))
    {
        bail!("invalid scan metadata or declaration");
    }
    let mut errors = Vec::new();
    let mut rejected = Vec::new();
    let mut ignored = 0;
    if !s.complete {
        errors.push(issue(
            "incomplete-scan",
            "The scan is incomplete. No award can be verified.",
            None,
        ));
    }
    if s.from_height >= r.start_height || s.to_height < r.reveal_deadline_height {
        errors.push(issue(
            "incomplete-window",
            "The entire anchor, bidding and reveal windows must be included.",
            None,
        ));
    }
    if s.tip_height < r.reveal_deadline_height + CONFIRMATIONS {
        errors.push(issue(
            "not-final",
            "Wait for the reveal deadline and five additional blocks.",
            None,
        ));
    }
    if bundle.manifest.anchor_txid.is_none() {
        errors.push(issue(
            "missing-anchor",
            "This draft has no rules anchor transaction.",
            None,
        ));
    }
    let expected = receivers(r)?;
    let mut outputs = HashSet::new();
    let mut bids: HashMap<String, Bid> = HashMap::new();
    let mut reveals = Vec::new();
    let mut anchor_found = false;
    for record in &s.records {
        if !is_hex(&record.txid, 64)
            || !height(record.height)
            || record.height < s.from_height
            || record.height > s.to_height
            || record.output_index > 1_000_000
            || minor(&record.value_zatoshis).is_none()
            || record.memo.len() > 512
            || !["practice", "sapling", "orchard", "ironwood"].contains(&record.pool.as_str())
            || (r.network == "practice"
                && (record.pool != "practice" || record.recipient_hex != "practice"))
            || (r.network == "test"
                && (record.pool == "practice" || !is_hex(&record.recipient_hex, 86)))
        {
            bail!("malformed or out-of-range output in supplied records");
        }
        if !outputs.insert((&record.txid, &record.pool, record.output_index)) {
            errors.push(issue(
                "duplicate-output",
                "A transaction output appears more than once.",
                None,
            ));
            continue;
        }
        if !matches_recipient(record, &expected) {
            ignored += 1;
            continue;
        }
        let Some(memo) = parse_memo(&record.memo).filter(|m| m.tender_id() == r.tender_id) else {
            ignored += 1;
            continue;
        };
        if record.value_zatoshis != r.submission_zatoshis {
            rejected.push(issue(
                "wrong-amount",
                "Protocol payment does not use the pinned fixed amount.",
                Some(&record.txid),
            ));
            continue;
        }
        if !record.shielded_source {
            rejected.push(issue(
                "transparent-source",
                "Payment has transparent inputs and is not a private bid.",
                Some(&record.txid),
            ));
            continue;
        }
        let bid_rules = match &memo {
            Memo::Anchor { .. } => None,
            Memo::Commit { rules_hash, .. } | Memo::Reveal { rules_hash, .. } => Some(*rules_hash),
        };
        if bid_rules.is_some_and(|hash| hash != bundle.manifest.rules_hash) {
            errors.push(issue(
                "rules-conflict",
                "A bid refers to different rules for the same round. No award can be verified.",
                None,
            ));
            continue;
        }
        let claim_key = memo.claim_key();
        if !matches!(memo, Memo::Anchor { .. }) && ((r.version == 2) != claim_key.is_some()) {
            rejected.push(issue(
                "proof-policy",
                "Bid memo does not match this round’s ownership-proof policy.",
                Some(&record.txid),
            ));
            continue;
        }
        match memo {
            Memo::Anchor { .. } => {
                if is_valid_anchor(&bundle.manifest, record, &expected) {
                    anchor_found = true;
                } else {
                    rejected.push(issue(
                        "invalid-anchor",
                        "Rules anchor is late, different, or not the advertised transaction.",
                        Some(&record.txid),
                    ));
                }
            }
            Memo::Commit { hash, .. } => {
                if record.height < r.start_height || record.height > r.commit_deadline_height {
                    rejected.push(issue(
                        "late-commit",
                        "Commitment is outside the pinned bidding window.",
                        Some(&record.txid),
                    ));
                    continue;
                }
                if let Some(existing) = bids.get_mut(hash) {
                    if existing.claim_public_key_hex.as_deref() != claim_key {
                        errors.push(issue(
                            "conflicting-proof-keys",
                            "Duplicate commitment records refer to different ownership keys.",
                            None,
                        ));
                        continue;
                    }
                    existing.commit_height = existing.commit_height.min(record.height);
                    rejected.push(issue(
                        "duplicate-commit",
                        "Duplicate commitment counts once at its earliest valid block.",
                        Some(&record.txid),
                    ));
                } else {
                    bids.insert(
                        hash.to_string(),
                        Bid {
                            commitment_hex: hash.to_string(),
                            commit_height: record.height,
                            reveal_height: None,
                            price_minor: None,
                            status: "unrevealed",
                            claim_public_key_hex: claim_key.map(String::from),
                        },
                    );
                }
            }
            Memo::Reveal { price, salt, .. } => {
                if record.height <= r.commit_deadline_height
                    || record.height > r.reveal_deadline_height
                {
                    rejected.push(issue(
                        "reveal-window",
                        "Reveal is outside the pinned reveal window.",
                        Some(&record.txid),
                    ));
                    continue;
                }
                reveals.push((record, price, salt, claim_key));
            }
        }
    }
    if !anchor_found {
        errors.push(issue(
            "unverified-rules",
            "The advertised rules hash was not anchored before bidding opened.",
            None,
        ));
    }
    if bids.len() > r.member_count as usize {
        errors.push(issue(
            "too-many-bids",
            "More distinct commitments than advertised members; membership is not verified.",
            None,
        ));
    }
    let cap = u128::from(minor(&r.pot_minor).expect("validated")) * u128::from(r.discount_cap_bps)
        / 10_000;
    for (record, price, salt, claim_key) in reveals {
        let hash = match claim_key {
            Some(key) => {
                claimed_commitment(&r.tender_id, &bundle.manifest.rules_hash, price, salt, key)
            }
            None => commitment(&r.tender_id, &bundle.manifest.rules_hash, price, salt),
        };
        let Some(bid) = bids.get_mut(&hash) else {
            rejected.push(issue(
                "unmatched-reveal",
                "Reveal does not reproduce a valid on-time commitment.",
                Some(&record.txid),
            ));
            continue;
        };
        if bid.claim_public_key_hex.as_deref() != claim_key {
            rejected.push(issue(
                "proof-key-mismatch",
                "Opening uses a different ownership key from the committed bid.",
                Some(&record.txid),
            ));
            continue;
        }
        if bid.reveal_height.is_some_and(|h| h <= record.height) {
            continue;
        }
        bid.reveal_height = Some(record.height);
        bid.price_minor = Some(price.to_string());
        bid.status = if u128::from(minor(price).expect("parsed")) <= cap {
            "valid"
        } else {
            "above-cap"
        };
    }
    let mut bids: Vec<_> = bids.into_values().collect();
    bids.sort_by(|a, b| {
        a.commit_height
            .cmp(&b.commit_height)
            .then(a.commitment_hex.cmp(&b.commitment_hex))
    });
    let mut valid: Vec<_> = bids
        .iter()
        .filter(|b| b.status == "valid")
        .cloned()
        .collect();
    valid.sort_by(|a, b| {
        minor(b.price_minor.as_ref().expect("valid"))
            .cmp(&minor(a.price_minor.as_ref().expect("valid")))
            .then(a.commit_height.cmp(&b.commit_height))
            .then(a.commitment_hex.cmp(&b.commitment_hex))
    });
    let calculated = valid.first().cloned();
    let mut claim = "not-provided";
    if let Some(declared) = &bundle.declared_winner_commitment {
        claim = if declared.as_ref() == calculated.as_ref().map(|b| &b.commitment_hex) {
            "matches"
        } else {
            "mismatch"
        };
        if claim == "mismatch" {
            errors.push(issue("wrong-winner", "The declared winner does not follow from the pinned rules and valid revealed bids.", None));
        }
    }
    let ok = errors.is_empty();
    Ok(Outcome {
        ok,
        scope: if r.network == "practice" {
            "practice"
        } else {
            "supplied-records"
        },
        winner: if ok { calculated } else { None },
        bids,
        errors,
        rejected,
        ignored,
        claim,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> Rules {
        Rules {
            version: 1,
            tender_id: "a1b2c3d4e5f60718".into(),
            network: "practice".into(),
            address: "local-practice-only".into(),
            title: "October savings circle".into(),
            currency: "NGN".into(),
            pot_minor: "60000000".into(),
            member_count: 8,
            discount_cap_bps: 2500,
            start_height: 100,
            commit_deadline_height: 112,
            reveal_deadline_height: 124,
            submission_zatoshis: "100000".into(),
            tie_break: "earliest-block-then-commitment".into(),
        }
    }
    fn record(id: char, height: u32, memo: String) -> ChainMemo {
        ChainMemo {
            txid: id.to_string().repeat(64),
            height,
            pool: "practice".into(),
            output_index: 0,
            recipient_hex: "practice".into(),
            value_zatoshis: "100000".into(),
            shielded_source: true,
            memo,
        }
    }
    fn bundle() -> Bundle {
        let r = rules();
        let hash = sha256(&rules_preimage(&r));
        let salt = "b".repeat(64);
        let bid = commitment(&r.tender_id, &hash, "6500000", &salt);
        Bundle {
            format: "sealed-tender-audit-v1".into(),
            manifest: Manifest {
                format: "sealed-tender-round-v1".into(),
                rules: r.clone(),
                rules_hash: hash.clone(),
                anchor_txid: Some("1".repeat(64)),
            },
            scan: Scan {
                network: "practice".into(),
                source: "test simulation".into(),
                from_height: 99,
                to_height: 124,
                tip_height: 129,
                complete: true,
                records: vec![
                    record('1', 99, format!("ZT1A {} {hash}", r.tender_id)),
                    record('2', 104, format!("ZT2C {} {hash} {bid}", r.tender_id)),
                    record(
                        '3',
                        115,
                        format!("ZT2R {} {hash} 6500000 {salt}", r.tender_id),
                    ),
                ],
            },
            declared_winner_commitment: None,
        }
    }
    #[test]
    fn honest_round_and_dishonest_declaration() {
        let mut b = bundle();
        let outcome = audit(&b).unwrap();
        assert!(outcome.ok);
        assert_eq!(
            outcome.winner.unwrap().price_minor.as_deref(),
            Some("6500000")
        );
        b.declared_winner_commitment = Some(Some("f".repeat(64)));
        let outcome = audit(&b).unwrap();
        assert!(!outcome.ok);
        assert!(outcome.winner.is_none());
    }
    #[test]
    fn changed_rules_and_incomplete_scan_fail() {
        let mut b = bundle();
        b.manifest.rules.member_count = 9;
        assert!(audit(&b).is_err());
        let mut b = bundle();
        b.scan.complete = false;
        assert!(!audit(&b).unwrap().ok);
        let mut b = bundle();
        b.scan.records.remove(0);
        assert!(!audit(&b).unwrap().ok);
    }
    #[test]
    fn changed_price_and_transparent_source_are_rejected() {
        let mut b = bundle();
        b.scan.records[2].memo = b.scan.records[2].memo.replace("6500000", "6500001");
        assert!(audit(&b).unwrap().winner.is_none());
        let mut b = bundle();
        b.scan.records[1].shielded_source = false;
        assert!(audit(&b).unwrap().winner.is_none());
    }
    #[test]
    fn null_declaration_is_not_missing_declaration() {
        let mut value = serde_json::to_value(bundle()).unwrap();
        value["declaredWinnerCommitment"] = serde_json::Value::Null;
        let b: Bundle = serde_json::from_value(value).unwrap();
        assert_eq!(audit(&b).unwrap().claim, "mismatch");
    }
    #[test]
    fn oversized_values_and_unknown_fields_fail() {
        assert!(minor("1000000000000000000").is_none());
        assert!(minor("01").is_none());
        let mut value = serde_json::to_value(bundle()).unwrap();
        value["seed"] = serde_json::json!("not allowed");
        assert!(serde_json::from_value::<Bundle>(value).is_err());
    }
    #[test]
    fn bids_are_bound_to_full_rules_hash() {
        let mut b = bundle();
        let different = "f".repeat(64);
        assert_ne!(
            commitment(
                &b.manifest.rules.tender_id,
                &b.manifest.rules_hash,
                "6500000",
                &"b".repeat(64)
            ),
            commitment(
                &b.manifest.rules.tender_id,
                &different,
                "6500000",
                &"b".repeat(64)
            )
        );
        b.scan.records[1].memo = b.scan.records[1]
            .memo
            .replace(&b.manifest.rules_hash, &different);
        let outcome = audit(&b).unwrap();
        assert!(!outcome.ok);
        assert!(
            outcome
                .errors
                .iter()
                .any(|issue| issue.code == "rules-conflict")
        );
    }
    #[test]
    fn anchor_preflight_accepts_only_permitted_whitespace() {
        let b = bundle();
        let expected = receivers(&b.manifest.rules).unwrap();
        let mut anchor = b.scan.records[0].clone();
        assert!(is_valid_anchor(&b.manifest, &anchor, &expected));
        anchor.memo = format!(" \t{}\n", anchor.memo);
        assert!(is_valid_anchor(&b.manifest, &anchor, &expected));
        anchor.memo = anchor.memo.trim().replace(' ', "  ");
        assert!(!is_valid_anchor(&b.manifest, &anchor, &expected));
    }
    #[test]
    fn anchor_preflight_checks_all_fields_on_the_same_output() {
        let b = bundle();
        let expected = receivers(&b.manifest.rules).unwrap();
        let original = b.scan.records[0].clone();
        let mut changed = original.clone();
        changed.height = 0;
        assert!(!is_valid_anchor(&b.manifest, &changed, &expected));
        changed = original.clone();
        changed.height = b.manifest.rules.start_height;
        assert!(!is_valid_anchor(&b.manifest, &changed, &expected));
        changed = original.clone();
        changed.value_zatoshis = "1".into();
        assert!(!is_valid_anchor(&b.manifest, &changed, &expected));
        changed = original.clone();
        changed.shielded_source = false;
        assert!(!is_valid_anchor(&b.manifest, &changed, &expected));
        changed = original.clone();
        changed.recipient_hex = "another-address".into();
        assert!(!is_valid_anchor(&b.manifest, &changed, &expected));
        changed = original.clone();
        changed.txid = "f".repeat(64);
        assert!(!is_valid_anchor(&b.manifest, &changed, &expected));
        changed = original;
        changed.memo = format!("ZT1A {} {}", b.manifest.rules.tender_id, "e".repeat(64));
        assert!(!is_valid_anchor(&b.manifest, &changed, &expected));
    }
}
