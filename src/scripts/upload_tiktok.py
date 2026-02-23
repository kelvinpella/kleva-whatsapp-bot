#!/usr/bin/env python3
"""
TikTok Video Upload Script
Called by Node.js via child_process.spawn.
Outputs JSON to stdout.
Exit code: 0 = success, 1 = failure.
"""

import argparse
import json
import sys

import tiktok_uploader.upload as _tu_upload
from tiktok_uploader.upload import TikTokUploader

# ---------------------------------------------------------------------------
# 1. Monkey Patch Playwright (Fixing Broken Buttons & Success Timeouts)
# ---------------------------------------------------------------------------

_original_set_interactivity = _tu_upload._set_interactivity

def _clear_tutorials_and_dialogs(*args, **kwargs):
    page = args[0]
    sys.stderr.write("[interactivity_upload] Clearing tutorials and dialogs before posting...\n")
    sys.stderr.flush()
    page.evaluate("""
() => {
    // --------- DISMISS POPUPS ----------
    const targets = [
        "got it", "not now", "maybe later", "skip", "close", "done", "next",
        "ruka", "funga"
    ];

    document.querySelectorAll('div, button, span').forEach(el => {
        const text = (el.innerText || "").trim().toLowerCase();
        if (targets.includes(text) && el.offsetParent !== null) {
            const btn = el.closest('button') || el;
            try { btn.click(); } catch(e) {}
        }
    });

    // --------- DISABLE TIKTOK SWITCHES ----------
    // We look for switches that belong to:
    // - Music copyright check
    // - Content check lite

    const SWITCH_LABELS = [
        "copyright",
        "music copyright",
        "content check",
        "content check lite"
    ];

    // Find all switch inputs
    const switches = document.querySelectorAll('[role="switch"]');

    switches.forEach(sw => {
        try {
            // Only disable if currently enabled
            if (!sw.classList.contains("Switch__input--checked-true")) return;

            // Find parent container with label text
            let parent = sw.closest("div");

            while (parent) {
                const text = (parent.innerText || "").toLowerCase();

                if (SWITCH_LABELS.some(label => text.includes(label))) {
                    sw.click(); // turn OFF
                    break;
                }

                parent = parent.parentElement;
            }

        } catch(e) {}
    });
}
""")
    return _original_set_interactivity(*args, **kwargs)
    
    
_tu_upload._set_interactivity = _clear_tutorials_and_dialogs

# ---------------------------------------------------------------------------
# 3. Main upload logic
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Upload a video to TikTok")
    parser.add_argument("--video", required=True, help="Path to video file")
    parser.add_argument("--description", required=True, help="Caption text")
    parser.add_argument("--cookies", required=True, help="Path to cookies.txt")
    args = parser.parse_args()

    uploader = TikTokUploader(
        cookies=args.cookies,
        headless=False,   
        browser="chrome"
    )

    try:
        # Note: I removed the comment=False, stitch=False, duet=False here 
        # so you don't get that 30-second delay for interactivity settings anymore!
        success = uploader.upload_video(
            args.video,
            description=args.description
        )

        if success:
            print(json.dumps({"success": True}))
            sys.exit(0)
        else:
            print(json.dumps({"success": False, "error": "upload_video returned False"}))
            sys.exit(1)

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()