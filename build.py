#!/usr/bin/env python3
"""Root shim — the real generator lives in generator/build.py."""
import runpy, os
runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "generator", "build.py"), run_name="__main__")
