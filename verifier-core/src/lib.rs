//! Shielded memo decryption, compiled to WebAssembly.
//!
//! This crate is deliberately tiny and does no I/O. It accepts a viewing key
//! and the raw bytes of a Zcash transaction, trial-decrypts the shielded
//! outputs, and hands back JSON. Networking lives in the JavaScript caller.
//!
//! Two reasons it is built this way rather than as a native binary:
//!
//! 1. A verifier an auditor cannot run is not a verifier. Shipping this as
//!    WebAssembly driven by Node means anyone can check a tender without
//!    installing a Rust toolchain.
//! 2. Keeping the cryptography in one small module with no network access
//!    makes the part that matters for the privacy argument easy to read.
//!
//! The exported interface is plain C ABI rather than wasm-bindgen, so the build
//! needs nothing beyond `cargo build --target wasm32-unknown-unknown`.

use std::collections::HashMap;

use zcash_client_backend::decrypt_transaction;
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::{BlockHeight, BranchId, Network};
use zcash_protocol::memo::{Memo, MemoBytes};

/// Only ever one key is used per call, so the account id is a constant.
const ACCOUNT: u32 = 0;

// ---------------------------------------------------------------------------
// Memory management for the wasm boundary.
//
// The caller allocates, writes its arguments into linear memory, calls
// `decrypt_tx`, reads the JSON result, then frees both. Lengths are explicit
// because wasm has no notion of a string.
// ---------------------------------------------------------------------------

/// Reserve `len` bytes and hand back a pointer the caller can write into.
#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Release a buffer previously handed out by `alloc`.
///
/// # Safety
/// `ptr` and `len` must come from a prior `alloc` call and must not be reused.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len > 0 {
        drop(unsafe { Vec::from_raw_parts(ptr, 0, len) });
    }
}

/// Decrypt the shielded outputs of one transaction.
///
/// `network` is 0 for mainnet and 1 for testnet. The result is a pointer to
/// UTF-8 JSON whose length is written to `out_len`. The caller owns that buffer
/// and must free it with `dealloc`.
///
/// Errors are returned as JSON too (`{"error": "..."}`) rather than as a trap,
/// so a malformed transaction degrades into a readable message instead of
/// killing the module.
///
/// # Safety
/// All pointers must reference initialised buffers of the stated lengths.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn decrypt_tx(
    network: u32,
    height: u32,
    ufvk_ptr: *const u8,
    ufvk_len: usize,
    tx_ptr: *const u8,
    tx_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let ufvk_bytes = unsafe { std::slice::from_raw_parts(ufvk_ptr, ufvk_len) };
    let tx_bytes = unsafe { std::slice::from_raw_parts(tx_ptr, tx_len) };

    let json = match decrypt_to_json(network, height, ufvk_bytes, tx_bytes) {
        Ok(j) => j,
        Err(e) => serde_json::json!({ "error": e }).to_string(),
    };

    let mut bytes = json.into_bytes();
    bytes.shrink_to_fit();
    let len = bytes.len();
    let ptr = bytes.as_mut_ptr();
    std::mem::forget(bytes);
    unsafe { *out_len = len };
    ptr
}

fn decrypt_to_json(
    network: u32,
    height: u32,
    ufvk_bytes: &[u8],
    tx_bytes: &[u8],
) -> Result<String, String> {
    let network = match network {
        0 => Network::MainNetwork,
        1 => Network::TestNetwork,
        n => return Err(format!("network must be 0 (main) or 1 (test), got {n}")),
    };

    let ufvk_str = std::str::from_utf8(ufvk_bytes)
        .map_err(|_| "the viewing key is not valid UTF-8".to_string())?;

    // A viewing key is network-scoped, so a mainnet key will not decode against
    // testnet parameters. That catches the easy mistake of mixing the two.
    let ufvk = UnifiedFullViewingKey::decode(&network, ufvk_str)
        .map_err(|e| format!("could not decode the viewing key: {e}"))?;

    if height == 0 {
        return Err("transaction is not mined, so it has no fixed chain position".to_string());
    }
    let block_height = BlockHeight::from_u32(height);

    // The consensus branch at the mined height decides how the transaction
    // parses, so it has to be derived rather than assumed.
    let branch = BranchId::for_height(&network, block_height);
    let tx = Transaction::read(tx_bytes, branch)
        .map_err(|e| format!("could not parse the transaction: {e}"))?;

    let mut ufvks = HashMap::new();
    ufvks.insert(ACCOUNT, ufvk);

    let decrypted = decrypt_transaction(&network, Some(block_height), None, &tx, &ufvks);

    let mut outputs = Vec::new();

    for output in decrypted.sapling_outputs() {
        outputs.push(serde_json::json!({
            "pool": "sapling",
            "index": output.index(),
            "zatoshi": output.note_value().into_u64(),
            "memo": render_memo(output.memo()),
        }));
    }

    for output in decrypted.orchard_outputs() {
        // Orchard outputs carry a (Note, ValuePool) pair rather than a bare
        // note, so the value comes off the note itself instead of through the
        // `note_value` helper the Sapling specialisation provides.
        let (note, _value_pool) = output.note();
        outputs.push(serde_json::json!({
            "pool": "orchard",
            "index": output.index(),
            "zatoshi": note.value().inner(),
            "memo": render_memo(output.memo()),
        }));
    }

    Ok(serde_json::json!({
        "txid": tx.txid().to_string(),
        "height": height,
        "outputs": outputs,
    })
    .to_string())
}

/// Turn raw memo bytes into something printable.
///
/// Memos are always padded to 512 bytes and may legitimately be empty or
/// non-text, so every case is reported rather than treated as an error.
fn render_memo(bytes: &MemoBytes) -> String {
    match Memo::try_from(bytes.clone()) {
        Ok(Memo::Text(text)) => text.to_string(),
        Ok(Memo::Empty) => String::new(),
        Ok(Memo::Future(_)) => "<reserved memo format>".to_string(),
        Ok(Memo::Arbitrary(data)) => format!("<{} bytes of non-text data>", data.len()),
        Err(e) => format!("<undecodable memo: {e}>"),
    }
}
