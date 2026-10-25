//! Ed25519 challenge response for a key bound to a winning bid.
//! Proves control of that key, not membership, legal identity or chain consensus.
use crate::audit::{self, Bundle};
use anyhow::Result;
use ed25519_compact::{PublicKey, Signature};
use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Challenge {
    pub format: String,
    pub tender_id: String,
    pub rules_hash: String,
    pub commitment_hex: String,
    pub nonce_hex: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Proof {
    pub format: String,
    pub tender_id: String,
    pub rules_hash: String,
    pub commitment_hex: String,
    pub nonce_hex: String,
    pub claim_public_key_hex: String,
    pub signature_hex: String,
}

pub fn preimage(challenge: &Challenge) -> String {
    serde_json::json!([
        "NEXTTURN-WINNER-CLAIM-v1",
        challenge.tender_id,
        challenge.rules_hash,
        challenge.commitment_hex,
        challenge.nonce_hex
    ])
    .to_string()
}

pub fn verify(bundle: &Bundle, expected: &Challenge, proof: &Proof) -> Result<bool> {
    let outcome = audit::audit(bundle)?;
    let Some(winner) = outcome.winner else {
        return Ok(false);
    };
    let Some(public) = winner.claim_public_key_hex else {
        return Ok(false);
    };
    if !outcome.ok
        || bundle.manifest.rules.version != 2
        || expected.format != "nextturn-claim-challenge-v1"
        || proof.format != "nextturn-winner-proof-v1"
        || !audit::is_hex(&expected.tender_id, 16)
        || ![
            &expected.rules_hash,
            &expected.commitment_hex,
            &expected.nonce_hex,
            &public,
        ]
        .iter()
        .all(|v| audit::is_hex(v, 64))
        || !audit::is_hex(&proof.signature_hex, 128)
        || expected.tender_id != bundle.manifest.rules.tender_id
        || expected.rules_hash != bundle.manifest.rules_hash
        || expected.commitment_hex != winner.commitment_hex
        || proof.tender_id != expected.tender_id
        || proof.rules_hash != expected.rules_hash
        || proof.commitment_hex != expected.commitment_hex
        || proof.nonce_hex != expected.nonce_hex
        || proof.claim_public_key_hex != public
    {
        return Ok(false);
    }
    let Ok(bytes) = hex::decode(public) else {
        return Ok(false);
    };
    let Ok(bytes) = <[u8; 32]>::try_from(bytes.as_slice()) else {
        return Ok(false);
    };
    let Ok(signature) = hex::decode(&proof.signature_hex) else {
        return Ok(false);
    };
    let Ok(key) = PublicKey::from_slice(&bytes) else {
        return Ok(false);
    };
    if key.validate().is_err() {
        return Ok(false);
    }
    let Ok(signature) = Signature::from_slice(&signature) else {
        return Ok(false);
    };
    Ok(key
        .verify(preimage(expected).as_bytes(), &signature)
        .is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn challenge_preimage_is_stable() {
        let challenge = Challenge {
            format: "nextturn-claim-challenge-v1".into(),
            tender_id: "a".repeat(16),
            rules_hash: "b".repeat(64),
            commitment_hex: "c".repeat(64),
            nonce_hex: "d".repeat(64),
        };
        let value: serde_json::Value = serde_json::from_str(&preimage(&challenge)).unwrap();
        assert_eq!(value[0], "NEXTTURN-WINNER-CLAIM-v1");
        assert_eq!(value[4], "d".repeat(64));
    }
    #[test]
    fn private_key_fields_are_not_public_proofs() {
        let value = serde_json::json!({"format":"nextturn-winner-proof-v1","tenderId":"a".repeat(16),"rulesHash":"b".repeat(64),"commitmentHex":"c".repeat(64),"nonceHex":"d".repeat(64),"claimPublicKeyHex":"e".repeat(64),"signatureHex":"f".repeat(128),"claimPrivateKeyHex":"never public"});
        assert!(serde_json::from_value::<Proof>(value).is_err());
    }
    #[test]
    fn weak_identity_key_does_not_verify() {
        let mut key = [0u8; 32];
        key[0] = 1;
        let mut signature = [0u8; 64];
        signature[0] = 1;
        let public = PublicKey::new(key);
        assert!(public.validate().is_err());
        assert!(
            public
                .verify(b"fresh challenge", &Signature::new(signature))
                .is_err()
        );
    }
}
