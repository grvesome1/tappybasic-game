gruesøme's avatar studio · Asset Edition v2.7
built by gruesøme
SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f2999e2373f

Run:
  Windows: double-click RUN-WINDOWS.bat
  Mac/Linux: ./run.sh

Open:
  http://127.0.0.1:8080/index.html

QA / Placement:
  http://127.0.0.1:8080/placement-lab.html

Notes:
  - Standalone (no dashboard required).
  - Leveling + Achievements removed (everything unlocked).
  - v2.7: traits list scroll fixed, placement tuned, no drawn arms (hands only).
  - "Mint (lock)" freezes the current DNA inside the app (localStorage). Real immutability requires on-chain minting.
  - All traits are PNG layers in ./assets/traits/ (128x128).
  - Full technical docs: see OVERVIEW.md

Dev checks:
  - Verify traits.json paths + PNG sizes:
      python .\tools\verify_assets.py
    (Current warnings: eyewear_analyzer.png and helmet_space.png are not 128x128; renderer scales them.)
