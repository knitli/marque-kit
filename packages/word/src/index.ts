// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/**
 * The Word adapter (docs/COMPONENTS.md, "Mechanics in Word").
 * - A content control per marked span, tagged mq:<finding id>, titled in words.
 * - The shape as an underline style; Word has no underline color, so the shape carries it alone.
 * - The pane follows the selection (DECISIONS #8); check the current Word API for a hover event first.
 * - Every mark is reversible: the original formatting is recorded and restored.
 * - The kit's state persisted with the document; the Purview label read and checked against the banner.
 *
 * Needs stable finding ids across re-lints (marque-dev#2639). Not built yet: this package holds the place.
 */

export {};
