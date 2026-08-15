/**
 * Where the two notebooks live.
 *
 * These are built in rather than typed into a Settings page (owner's decision,
 * Aug 2026): the addresses do not change, and storing them per-device meant a
 * wiped phone silently lost its connection — which is exactly what happened.
 * Built in, every device that opens the app is already connected.
 *
 * THEY ARE PUBLIC. This repo and the published site are both public, so anyone
 * who reads the page's code can read these. With no password on either script
 * (the owner's choice, v1.4.0), that means anyone holding one can READ a
 * notebook or WRITE to it. Erasing stays unreachable — it is a menu item inside
 * each spreadsheet — so the worst case is snooping or mess, not destruction.
 * The owner was told this plainly and chose it.
 *
 * If an address ever does change — creating a NEW deployment gives a new /exec
 * address, while updating an existing one keeps it — change it here and push.
 */

export const DOUGH_URL =
  'https://script.google.com/macros/s/AKfycby2yBi1FEYabzAatB2Mz2UxPpyQNBUtoOMAsOO8Wgvx6sXYH5BYaE3AgmfTfrLQMzd8/exec';

export const TEMPS_URL =
  'https://script.google.com/macros/s/AKfycbwb9KWYG-2QSUYqL8hwiIVPMf7PJQdoFUmtJmlMBsu0kJLWhcXjuLAT9TSxTFbqp7SK/exec';
