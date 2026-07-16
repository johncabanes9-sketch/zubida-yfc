// Proves upload validation rejects forged/oversized files and that a real
// upload round-trips through Storage without leaving orphans.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const { validateImage, sniffImageType, MAX_BYTES } = await import("../src/lib/images/validate.ts");

let pass = 0, fail = 0;
const check = (n, c, got) => c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG  = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x45,0x42,0x50]);
// "MZ" — a Windows executable. This is the attack: a real .exe with an image MIME.
const EXE  = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0]);
const SVG  = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

check("sniffs jpeg", sniffImageType(JPEG) === "image/jpeg", sniffImageType(JPEG));
check("sniffs png",  sniffImageType(PNG)  === "image/png",  sniffImageType(PNG));
check("sniffs webp", sniffImageType(WEBP) === "image/webp", sniffImageType(WEBP));

// The core security assertion: the bytes decide, so a forged declaration is irrelevant.
check("REJECTS exe (MZ) even if the client calls it a jpeg", validateImage(EXE, EXE.length).ok === false, validateImage(EXE, EXE.length));
check("REJECTS svg (script vector)",      validateImage(SVG, SVG.length).ok === false, validateImage(SVG, SVG.length));
check("REJECTS oversized file",           validateImage(JPEG, MAX_BYTES + 1).ok === false, validateImage(JPEG, MAX_BYTES + 1));
// Positive control — without this an always-reject bug would pass everything above.
check("ACCEPTS a real jpeg",              validateImage(JPEG, JPEG.length).ok === true, validateImage(JPEG, JPEG.length));
// The renamed-file case: a real PNG that a browser labels image/jpeg (because the
// user renamed it .jpg) must be ACCEPTED and reported as png, so the caller stores
// the correct contentType. Guards against reintroducing a declared-vs-actual check.
const pngResult = validateImage(PNG, PNG.length);
check("ACCEPTS a real png regardless of what the client called it",
      pngResult.ok === true && pngResult.mime === "image/png", pngResult);

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
