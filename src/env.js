// Коя сборка е това: артефакт в claude.ai или собственият сайт (без вход).
// build.mjs подменя __SITE__ при сглобяване; в тестовете и при разработка е false.
/* global __SITE__ */
export const SITE = typeof __SITE__ !== 'undefined' && __SITE__ === true;
