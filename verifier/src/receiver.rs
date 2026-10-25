//! Fresh, dedicated testnet receiver. Secret material goes straight to private
//! files, never stdout. This neither reads an existing wallet nor sends funds.
use std::{fs, io::Write, path::Path};

use anyhow::{Context, Result, anyhow};
use serde::Serialize;
use zcash_keys::keys::{UnifiedAddressRequest, UnifiedSpendingKey};
use zcash_protocol::consensus::Network;

#[derive(Serialize)]
pub struct PublicReceiver {
    format: &'static str,
    network: &'static str,
    pub address: String,
}

fn private_directory(path: &Path) -> Result<()> {
    #[cfg(unix)]
    let builder = {
        use std::os::unix::fs::DirBuilderExt;
        let mut builder = fs::DirBuilder::new();
        builder.mode(0o700);
        builder
    };
    #[cfg(not(unix))]
    let builder = fs::DirBuilder::new();
    builder
        .create(path)
        .context("receiver folder must be new; refusing to overwrite")
}

fn new_file(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .context("receiver output must be a new file")?;
    file.write_all(bytes)
        .context("could not write receiver file")?;
    file.sync_all()
        .context("could not finish writing receiver file")
}

pub fn initialise(directory: &Path) -> Result<PublicReceiver> {
    private_directory(directory)?;
    private_directory(&directory.join("private"))?;
    private_directory(&directory.join("public"))?;
    let network = Network::TestNetwork;
    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed).context("could not obtain OS randomness")?;
    let spending = UnifiedSpendingKey::from_seed(&network, &seed, zip32::AccountId::ZERO)
        .map_err(|_| anyhow!("could not derive the dedicated receiver"))?;
    let full = spending.to_unified_full_viewing_key();
    let (address, _) = full
        .default_address(UnifiedAddressRequest::SHIELDED)
        .map_err(|_| anyhow!("could not derive a shielded-only address"))?;
    let incoming = full
        .to_unified_incoming_viewing_key()
        .encode(&network)
        .map_err(|_| anyhow!("could not encode the incoming-only key"))?;
    let public = PublicReceiver {
        format: "nextturn-round-receiver-v1",
        network: "test",
        address: address.encode(&network),
    };
    let saved_seed = new_file(&directory.join("private/seed.bin"), &seed);
    seed.fill(0);
    saved_seed?;
    new_file(
        &directory.join("private/incoming-key.txt"),
        format!("{incoming}\n").as_bytes(),
    )?;
    new_file(
        &directory.join("public/receiver.json"),
        format!("{}\n", serde_json::to_string_pretty(&public)?).as_bytes(),
    )?;
    Ok(public)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_path(label: &str) -> std::path::PathBuf {
        let time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "nextturn-receiver-{label}-{}-{time}",
            std::process::id()
        ))
    }

    #[test]
    fn public_descriptor_excludes_secret_material() {
        let path = test_path("public");
        let public = initialise(&path).unwrap();
        let value = serde_json::to_value(&public).unwrap();
        assert_eq!(value.as_object().unwrap().len(), 3);
        assert!(value.get("seed").is_none());
        assert!(value.get("uivk").is_none());
        assert!(value.get("ufvk").is_none());
        assert!(public.address.starts_with("utest1"));
        // Check file metadata only: never read or print the generated seed.
        assert_eq!(
            fs::metadata(path.join("private/seed.bin")).unwrap().len(),
            32
        );
        assert!(
            fs::metadata(path.join("private/incoming-key.txt"))
                .unwrap()
                .len()
                > 100
        );
        fs::remove_dir_all(path).unwrap(); // Only this test's exclusively created folder.
    }

    #[test]
    fn existing_output_directory_is_untouched() {
        let path = test_path("existing");
        fs::create_dir(&path).unwrap();
        let marker = path.join("existing-user-file.txt");
        fs::write(&marker, "keep this").unwrap();
        assert!(initialise(&path).is_err());
        assert_eq!(fs::read_to_string(marker).unwrap(), "keep this");
        assert!(!path.join("private").exists());
        fs::remove_dir_all(path).unwrap(); // Only this test's exclusively created folder.
    }
}
