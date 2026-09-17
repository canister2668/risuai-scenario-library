#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseFragment } from 'parse5';

const API = 'https://arca.live/api/app';
const BOARD = 'characterai';
const CATEGORY = '로어북';
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const outputDir = resolve(value('--output', 'scenario-library/crawl-output'));
const manifestInput = value('--manifest', '');
const maxPosts = Number.parseInt(value('--limit', '0'), 10) || Infinity;
const listOnly = args.includes('--list-only');
const delayMin = Number.parseInt(value('--delay-min', '650'), 10);
const delayMax = Number.parseInt(value('--delay-max', '1450'), 10);
const deviceToken = randomBytes(32).toString('hex');
const headers = {
  'User-Agent': 'net.umanle.arca.android.playstore/0.9.75',
  'X-Device-Token': deviceToken,
  Accept: 'application/json',
};

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const politeDelay = () => sleep(delayMin + Math.floor(Math.random() * Math.max(1, delayMax - delayMin + 1)));

async function requestJson(path, params = {}) {
  const url = new URL(API + path);
  for (const [key, entry] of Object.entries(params)) url.searchParams.set(key, entry);
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      if (response.status === 429) {
        const retryAfter = Number.parseInt(response.headers.get('retry-after') || '60', 10);
        await sleep(Math.max(60, retryAfter) * 1000);
        continue;
      }
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw new Error(`${url}: ${lastError?.message || lastError}`);
}

function htmlToText(html) {
  const tree = parseFragment(html);
  const blocks = new Set(['p', 'div', 'li', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr']);
  const ignored = new Set(['script', 'style', 'noscript']);
  let text = '';
  const visit = (node) => {
    if (node.nodeName === '#text') { text += node.value; return; }
    if (ignored.has(node.nodeName)) return;
    if (node.nodeName === 'br') text += '\n';
    for (const child of node.childNodes || []) visit(child);
    if (blocks.has(node.nodeName)) text += '\n';
    else if (node.nodeName === 'td' || node.nodeName === 'th') text += '\t';
  };
  visit(tree);
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isScenarioCandidate(text) {
  const signals = [
    /\{\{char\}\}/i,
    /\[\s*OOC\s*:/i,
    /(?:^|\n)#{1,6}\s*(?:\*\*)?Scenario\s*:/im,
    /상황극|시나리오|에피소드/i,
  ];
  return signals.reduce((score, pattern) => score + Number(pattern.test(text)), 0) >= 2;
}

async function listArticles() {
  const articles = new Map();
  const params = { category: CATEGORY };
  let page = 0;
  while (articles.size < maxPosts) {
    const data = await requestJson(`/list/channel/${BOARD}`, params);
    page += 1;
    for (const article of data.articles || []) {
      if (article.category === CATEGORY && !articles.has(article.id)) articles.set(article.id, article);
      if (articles.size >= maxPosts) break;
    }
    process.stderr.write(`\r목록 ${page}페이지 · ${articles.size}개`);
    if (!data.next || articles.size >= maxPosts) break;
    Object.assign(params, data.next);
    await politeDelay();
  }
  process.stderr.write('\n');
  return [...articles.values()].slice(0, maxPosts);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let listed;
  let manifestPath;
  if (manifestInput) {
    manifestPath = resolve(manifestInput);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.board !== BOARD || manifest.category !== CATEGORY || !Array.isArray(manifest.articles)) {
      throw new Error('지정한 목록 파일의 형식이나 게시판이 올바르지 않습니다.');
    }
    listed = manifest.articles.slice(0, maxPosts);
  } else {
    listed = await listArticles();
    manifestPath = resolve(outputDir, `arcalive-${BOARD}-${stamp}-manifest.json`);
    await writeFile(manifestPath, JSON.stringify({ board: BOARD, category: CATEGORY, count: listed.length, articles: listed }, null, 2));
  }
  if (listOnly) {
    console.log(JSON.stringify({ count: listed.length, manifest: manifestPath }, null, 2));
    return;
  }

  const partialPath = resolve(outputDir, `arcalive-${BOARD}-partial.json`);
  let records = [];
  let failures = [];
  try {
    const partial = JSON.parse(await readFile(partialPath, 'utf8'));
    if (partial.manifest === manifestPath && Array.isArray(partial.records)) {
      records = partial.records;
      failures = Array.isArray(partial.failures) ? partial.failures : [];
    }
  } catch {}
  const completed = new Set([...records.map((record) => record.sourceArticleId), ...failures.map((failure) => failure.sourceArticleId)]);
  for (let index = 0; index < listed.length; index += 1) {
    const summary = listed[index];
    if (completed.has(String(summary.id))) continue;
    try {
      const post = await requestJson(`/view/article/breaking/${summary.id}`);
      const rawContent = htmlToText(post.content || '');
      records.push({
        source: 'arca.live',
        sourceArticleId: String(post.id),
        sourceUrl: `https://arca.live/b/${post.boardSlug || BOARD}/${post.id}`,
        title: post.title || summary.title || String(post.id),
        author: post.nickname || null,
        createdAt: post.createdAt || null,
        updatedAt: post.updatedAt || null,
        isSensitive: Boolean(post.isSensitive),
        candidate: isScenarioCandidate(rawContent),
        rawContent,
        rawHtml: post.content || '',
        rawHtmlSha256: createHash('sha256').update(post.content || '').digest('hex'),
      });
    } catch (error) {
      failures.push({ sourceArticleId: String(summary.id), title: summary.title || null, error: error.message || String(error) });
    }
    completed.add(String(summary.id));
    process.stderr.write(`\r본문 ${completed.size}/${listed.length} · 후보 ${records.filter((record) => record.candidate).length}개 · 실패 ${failures.length}개`);
    if (completed.size % 100 === 0) {
      await writeFile(partialPath, JSON.stringify({ manifest: manifestPath, records, failures }));
    }
    if (index + 1 < listed.length) await politeDelay();
  }
  process.stderr.write('\n');

  const archivePath = resolve(outputDir, `arcalive-${BOARD}-${stamp}-raw.json`);
  const importPath = resolve(outputDir, `scenario-library-import-${stamp}.json`);
  const importedAt = new Date().toISOString();
  records.sort((a, b) => listed.findIndex((item) => String(item.id) === a.sourceArticleId) - listed.findIndex((item) => String(item.id) === b.sourceArticleId));
  await writeFile(archivePath, JSON.stringify({ version: 1, board: BOARD, category: CATEGORY, collectedAt: importedAt, records, failures }, null, 2));
  await writeFile(importPath, JSON.stringify({
    format: 'scenario-library-import',
    version: 1,
    source: 'arca.live',
    collectedAt: importedAt,
    entries: records.map(({ rawHtml, rawContent, ...record }) => ({ ...record, content: rawContent, selected: record.candidate })),
  }, null, 2));
  await unlink(partialPath).catch(() => {});
  console.log(JSON.stringify({
    count: records.length,
    candidates: records.filter((record) => record.candidate).length,
    failures: failures.length,
    manifest: basename(manifestPath),
    archive: archivePath,
    importFile: importPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
