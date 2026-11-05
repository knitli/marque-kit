// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The Outlook adapter (docs/COMPONENTS.md, "Mechanics in Outlook").
 * - Marks are <span data-mq> in the compose HTML, stripped on send.
 * - Send is the gate: OnMessageSend holds the message. That handler may run without a DOM,
 *   so the gate imports @knitli/marque-kit-core only, never @knitli/marque-kit.
 * - Classification headers and the subject are places a marking appears: read, checked, written.
 * - The Purview label read and checked against the banner; the mapping is the tenant's configuration.
 *
 * Not built yet: this package holds the place.
 */

export {};
