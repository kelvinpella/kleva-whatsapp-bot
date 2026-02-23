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

from playwright.sync_api import Page
import tiktok_uploader.upload as _tu_upload
from tiktok_uploader.upload import TikTokUploader

# ---------------------------------------------------------------------------
# 1. Monkey Patch Playwright (Fixing Broken Buttons & Success Timeouts)
# ---------------------------------------------------------------------------

_original_locator = Page.locator
_original_evaluate = Page.evaluate

def _patched_locator(self, selector, **kwargs):
    if 'data-e2e="post_video_button"' in selector or '.btn-post' in selector:
        sys.stderr.write("[upload_tiktok] Intercepting post button locator...\n")
        sys.stderr.flush()
        robust_selector = (
            'button[data-e2e="post_video_button"], '
            'div[data-e2e="post_video_button"], '
            'button:has-text("Post"), '
            'button:has-text("Chapisha")'
        )
        return _original_locator(self, robust_selector, **kwargs)
    
    if 'Your video has been uploaded' in selector:
        sys.stderr.write("[upload_tiktok] Intercepting confirmation locator...\n")
        sys.stderr.flush()
        robust_success_selector = (
            "//div[contains(text(), 'Your video has been uploaded') or "
            "contains(text(), 'Video published') or "
            "contains(text(), 'Imepakiwa') or "
            "contains(text(), 'imepakiwa')]"
        )
        return _original_locator(self, robust_success_selector, **kwargs)

    return _original_locator(self, selector, **kwargs)

def _patched_evaluate(self, expression, *args, **kwargs):
    if "click" in expression and "querySelector" in expression:
        sys.stderr.write("[upload_tiktok] Replacing broken JS fallback click...\n")
        sys.stderr.flush()
        expression = """
        (() => {
            const btn = Array.from(document.querySelectorAll('button, div')).find(el => 
                el.innerText && ['Post', 'Chapisha', '发布'].includes(el.innerText.trim())
            );
            if (btn) {
                btn.click();
            } else {
                const e2e = document.querySelector('[data-e2e="post_video_button"]');
                if (e2e) e2e.click();
            }
        })()
        """
    return _original_evaluate(self, expression, *args, **kwargs)

Page.locator = _patched_locator
Page.evaluate = _patched_evaluate

# ---------------------------------------------------------------------------
# 2. Inject Aggressive Dialog Watcher into complete_upload_form
# ---------------------------------------------------------------------------

_original_complete_upload_form = _tu_upload.complete_upload_form

def _complete_upload_form_with_dismiss(*args, **kwargs):
    page = args[0]

    sys.stderr.write("[upload_tiktok] Starting aggressive dialog auto-dismiss loop...\n")
    sys.stderr.flush()

    # Injected right after the video file is set.
    # We use setInterval because TikTok's React DOM replacements can detach MutationObservers.
    page.evaluate("""
        () => {
            if (window._hasDialogObserver) return;
            window._hasDialogObserver = true;

            // Include common tutorial dismiss words (case-insensitive)
            const targets = [
                "got it", "not now", "maybe later", "skip", "close", "done", "next",
                "ruka", "funga" 
            ];
            
            setInterval(() => {
                // 1. Fallback: Rapidly press Escape
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape', code: 'Escape', bubbles: true
                }));

                // 2. DOM Hunt: Propagate clicks from inner divs up to the actual button
                const elements = document.querySelectorAll('div, button, span');
                elements.forEach(el => {
                    const text = (el.innerText || "").trim().toLowerCase();
                    if (targets.includes(text) && el.offsetParent !== null) {
                        const targetButton = el.closest('button') || el;
                        try { 
                            targetButton.click(); 
                        } catch(e) {}
                    }
                });
            }, 1000); // Poll every second while the form is being filled
        }
    """)

    return _original_complete_upload_form(*args, **kwargs)

_tu_upload.complete_upload_form = _complete_upload_form_with_dismiss

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