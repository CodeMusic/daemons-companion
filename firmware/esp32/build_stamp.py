# C-91: every firmware says which build it is -- the commit it was made from and when -- so a board can be told from
# the newest at a glance (its DAY page, the site's YOUR DEVICES). PlatformIO runs this before each build (extra_scripts).
import subprocess
import time

Import("env")  # noqa: F821 -- PlatformIO's SCons

try:
    commit = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=env.subst("$PROJECT_DIR"),  # noqa: F821
                                     stderr=subprocess.DEVNULL).decode().strip()
except Exception:
    commit = "nogit"
stamp = "%s %s" % (commit, time.strftime("%m-%d %H:%M"))
env.Append(CPPDEFINES=[("COMPANION_BUILD", env.StringifyMacro(stamp))])  # noqa: F821
