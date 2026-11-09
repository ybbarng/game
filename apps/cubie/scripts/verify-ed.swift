// Sparkle EdDSA 서명을 공개 열쇠로만 확인한다(키체인을 열지 않는다, release.sh가 쓴다).
//   swift scripts/verify-ed.swift <파일> <서명 base64> <공개 열쇠 base64>
// sign_update --verify는 키체인의 비밀 열쇠를 읽어 암호 창을 띄우므로 쓰지 않는다.
// Sparkle은 파일 바이트 전체를 ed25519로 서명한다(SUSignatureVerifier와 같은 방식).
import CryptoKit
import Foundation

let args = CommandLine.arguments
guard args.count == 4 else {
  FileHandle.standardError.write("쓰는 법: verify-ed.swift <파일> <서명> <공개 열쇠>\n".data(using: .utf8)!)
  exit(2)
}
guard let data = FileManager.default.contents(atPath: args[1]),
  let sig = Data(base64Encoded: args[2]),
  let pubRaw = Data(base64Encoded: args[3]),
  let pub = try? Curve25519.Signing.PublicKey(rawRepresentation: pubRaw)
else {
  FileHandle.standardError.write("파일·서명·공개 열쇠를 읽지 못했다\n".data(using: .utf8)!)
  exit(2)
}
if pub.isValidSignature(sig, for: data) {
  exit(0)
}
FileHandle.standardError.write("서명이 공개 열쇠와 맞지 않는다\n".data(using: .utf8)!)
exit(1)
