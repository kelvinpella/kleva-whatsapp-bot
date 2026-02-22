#!/usr/bin/env python3
"""
TikTok Video Upload Script
Called by Node.js tiktokPostingWorker via child_process.spawn.
Outputs a JSON result to stdout.
Exit code: 0 = success, 1 = failure.
"""

import argparse
import json
import sys

from tiktok_uploader.upload import TikTokUploader


def main():
    parser = argparse.ArgumentParser(description='Upload a video to TikTok')
    parser.add_argument('--video', required=True, help='Path to the video file')
    parser.add_argument('--description', required=True, help='Post description/caption')
    parser.add_argument('--cookies', required=True, help='Path to TikTok cookies.txt file')
    args = parser.parse_args()

    try:
        uploader = TikTokUploader(
            cookies=args.cookies,
            headless=False,
            browser='chrome'
        )

        success = uploader.upload_video(
            args.video,
            description=args.description,
            comment=True,
            stitch=True,
            duet=True
        )

        if success:
            print(json.dumps({"success": True}))
            sys.exit(0)
        else:
            print(json.dumps({"success": False, "error": "upload_video returned False — TikTok upload failed"}))
            sys.exit(1)

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
