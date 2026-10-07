//! Quake's PACK archives (common.c: COM_LoadPackFile).
use std::collections::HashMap;

pub struct Pak {
    pub files: HashMap<String, (usize, usize)>,
    pub data: Vec<u8>,
}

fn le32(b: &[u8], o: usize) -> i32 { i32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]) }

impl Pak {
    pub fn parse(data: Vec<u8>) -> Result<Pak, String> {
        if data.len() < 12 || &data[0..4] != b"PACK" { return Err("not a PACK file".into()); }
        let (ofs, len) = (le32(&data, 4) as usize, le32(&data, 8) as usize);
        let mut files = HashMap::new();
        for i in 0..len / 64 {
            let e = ofs + i * 64;
            let name: Vec<u8> = data[e..e + 56].iter().take_while(|&&c| c != 0).copied().collect();
            let name = String::from_utf8_lossy(&name).to_lowercase();
            files.insert(name, (le32(&data, e + 56) as usize, le32(&data, e + 60) as usize));
        }
        Ok(Pak { files, data })
    }
    pub fn get(&self, name: &str) -> Option<&[u8]> {
        self.files.get(&name.to_lowercase()).map(|&(o, l)| &self.data[o..o + l])
    }
}
