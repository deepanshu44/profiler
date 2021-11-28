/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

export type ParsedFileNameFromSymbolication =
  | {|
      type: 'normal',
      path: string,
    |}
  | {|
      type: 'hg' | 'git',
      repo: string,
      path: string,
      rev: string,
    |}
  | {|
      type: 's3',
      bucket: string,
      digest: string,
      path: string,
    |};

// For native code, the symbolication API returns special filenames that allow
// you to find the exact source code that was used for the profiled build.
//
// Examples:
// "hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28"
// "git:github.com/rust-lang/rust:library/std/src/sys/unix/thread.rs:53cb7b09b00cbea8754ffb78e7e3cb521cb8af4b"
// "git:github.com/rust-lang/rust:../88f19c6dab716c6281af7602e30f413e809c5974//library/std/src/sys/windows/thread.rs:88f19c6dab716c6281af7602e30f413e809c5974"
// "s3:gecko-generated-sources:a5d3747707d6877b0e5cb0a364e3cb9fea8aa4feb6ead138952c2ba46d41045297286385f0e0470146f49403e46bd266e654dfca986de48c230f3a71c2aafed4/ipc/ipdl/PBackgroundChild.cpp:"
// "s3:gecko-generated-sources:4fd754dd7ca7565035aaa3357b8cd99959a2dddceba0fc2f7018ef99fd78ea63d03f9bf928afdc29873089ee15431956791130b97f66ab8fcb88ec75f4ba6b04/aarch64-apple-darwin/release/build/swgl-580c7d646d09cf59/out/ps_text_run_ALPHA_PASS_TEXTURE_2D.h:"
//
// This smart filename substitution is implemented here:
// https://searchfox.org/mozilla-central/rev/f213971fbd82ada22c2c4e2072f729c3799ec563/toolkit/crashreporter/tools/symbolstore.py#605-636
//
// It should be noted that this doesn't work perfectly. Sometimes, the paths
// returned by the symbolication API still contain the raw paths from the build
// machines. Examples:
//
// MSVC CRT:
//   "/builds/worker/workspace/obj-build/browser/app/f:/dd/vctools/crt/vcstartup/src/startup/exe_common.inl"
// Linux system libraries:
//   "/build/glibc-2ORdQG/glibc-2.27/csu/../csu/libc-start.c"
//   or even just "glib/gmain.c"
// Some rust stdlib functions: (https://bugzilla.mozilla.org/show_bug.cgi?id=1717973)
//   "/builds/worker/fetches/rustc/lib/rustlib/src/rust/library/std/src/sys_common/backtrace.rs"
const repoPathRegex =
  /^(?<vcs>hg|git):(?<repo>[^:]*):(?<path>[^:]*):(?<rev>[0-9a-f]*)$/;
const s3PathRegex =
  /^s3:(?<bucket>[^:]*):(?<digest>[0-9a-f]*)\/(?<path>[^:]*):$/;
export function parseFileNameFromSymbolication(
  file: string
): ParsedFileNameFromSymbolication {
  const repoMatch = repoPathRegex.exec(file);
  if (repoMatch !== null && repoMatch.groups) {
    const { vcs, repo, path, rev } = repoMatch.groups;
    if (vcs !== 'hg' && vcs !== 'git') {
      throw new Error(
        'The regexp ensures that "vcs" is "hg" or "git", so this cannot happen.'
      );
    }
    return {
      type: vcs,
      repo,
      path,
      rev,
    };
  }

  const s3Match = s3PathRegex.exec(file);
  if (s3Match !== null && s3Match.groups) {
    const { bucket, digest, path } = s3Match.groups;
    return {
      type: 's3',
      bucket,
      digest,
      path,
    };
  }

  // At this point, it could be a local path (if this is a native function), or
  // it could be an http/https/chrome URL (for JavaScript code).
  return {
    type: 'normal',
    path: file,
  };
}
