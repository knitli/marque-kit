// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

// Test-only raw stdin BLAKE3 digest. Link against the upstream portable C implementation.
#include <stdio.h>
#include "blake3.h"

int main(void) {
  blake3_hasher hasher;
  blake3_hasher_init(&hasher);
  unsigned char buffer[4096], output[BLAKE3_OUT_LEN];
  size_t count;
  while ((count = fread(buffer, 1, sizeof(buffer), stdin)) != 0) {
    blake3_hasher_update(&hasher, buffer, count);
  }
  if (ferror(stdin)) return 1;
  blake3_hasher_finalize(&hasher, output, sizeof(output));
  for (size_t index = 0; index < sizeof(output); ++index) printf("%02x", output[index]);
  putchar('\n');
  return 0;
}
