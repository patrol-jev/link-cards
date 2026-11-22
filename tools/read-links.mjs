#!/usr/bin/env node
/**
 * links.txt 의 주소를 하나씩 열어 제목 · 설명 · 미리보기 그림(og:image)을 읽고, index.html 의 카드 자료에 채웁니다.
 *
 *   node tools/read-links.mjs                 links.txt → index.html
 *   node tools/read-links.mjs my-links.txt    다른 목록 파일
 *
 * Node 18 이상이면 됩니다. 설치할 것은 없습니다.
 *
 * links.txt 한 줄의 꼴:
 *   https://주소 | 꼬리표1, 꼬리표2 | 직접 적을 한 줄(없으면 페이지의 설명을 씀)
 * 꼬리표와 한 줄은 빼도 됩니다. # 으로 시작하는 줄은 건너뜁니다. 내 컴퓨터(localhost) · 사내 주소도 건너뜁니다.
 *
 * 이미 있는 카드(같은 주소)는 직접 고친 제목 · 한 줄 · 그림을 그대로 둡니다. 새 주소만 읽어 붙입니다.
 * 읽지 못한 주소는 주소만으로 카드를 만들고, 그림은 비워 둡니다(빛깔 카드가 됩니다). 그림을 지어내지 않습니다.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const LIST = resolve(process.argv[2] ?? "links.txt");
const PAGE = resolve("index.html");
const WAIT_MS = 10_000;
const PAGE_BYTES = 3_000_000;

const unescape = (text) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function meta(html, name) {
  const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i").exec(html)?.[0] ?? "";
  const content = /content=("([^"]*)"|'([^']*)')/i.exec(tag);
  return unescape(content?.[2] ?? content?.[3] ?? "").replace(/\s+/g, " ").trim();
}

/** 밖에 공개된 주소만 엽니다. 내 컴퓨터 · 사내 주소는 읽지 않습니다. */
function outward(url) {
  if (!/^https?:$/.test(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.startsWith("[") || /^[\d.]+$/.test(host)) return false;
  return !/(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid)$/.test(host);
}

async function read(address) {
  const url = new URL(address);
  if (!outward(url)) return null;
  const response = await fetch(url, { signal: AbortSignal.timeout(WAIT_MS), headers: { "user-agent": "Mozilla/5.0 (compatible; link-cards)", "accept-language": "ko,en;q=0.8" } });
  if (!response.ok || !/html/i.test(response.headers.get("content-type") ?? "")) return null;
  const html = (await response.text()).slice(0, PAGE_BYTES);
  const title = meta(html, "og:title") || unescape(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const note = meta(html, "og:description") || meta(html, "description");
  const imageAt = meta(html, "og:image") || meta(html, "twitter:image");
  let image = "";
  if (imageAt) {
    try {
      const abs = new URL(imageAt, response.url);
      if (/^https?:$/.test(abs.protocol)) image = abs.href;
    } catch {
      // 그림 주소가 깨졌으면 비워 둔다.
    }
  }
  return { title, note, image };
}

const cut = (text, max) => ([...text].length > max ? `${[...text].slice(0, max - 1).join("")}…` : text);

const html = readFileSync(PAGE, "utf8");
const block = /(<script id="cards" type="application\/json">)([\s\S]*?)(<\/script>)/.exec(html);
if (!block) {
  console.error("index.html 에서 카드 자료(<script id=\"cards\">)를 찾지 못했어요.");
  process.exit(1);
}
const data = JSON.parse(block[2]);
const lines = readFileSync(LIST, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

// 기본 예시(원작자의 카드)가 들어 있으면 지우고 시작한다. 제목 · 이름 · 소개는 빈 예시(starter)의 것을 가져온다.
if (data.example) {
  const starter = /<script id="starter" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  const base = starter ? JSON.parse(starter[1]) : {};
  for (const key of ["title", "owner", "intro"]) data[key] = base[key] ?? "";
  data.cards = [];
  delete data.example;
  console.log("기본 예시를 비우고 내 카드로 채워요.");
}
const had = new Map((data.cards ?? []).map((card) => [card.url, card]));
const today = new Date().toISOString().slice(0, 10);
const next = [];

for (const line of lines) {
  const [address, tagText = "", own = ""] = line.split("|").map((part) => part.trim());
  let url;
  try {
    url = new URL(address).href;
  } catch {
    console.log(`건너뜀(주소가 아님): ${address}`);
    continue;
  }
  if (!outward(new URL(url))) {
    console.log(`건너뜀(내 컴퓨터 · 사내 주소라 싣지 않음): ${address}`);
    continue;
  }
  const tags = tagText.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 3);
  const old = had.get(url);
  if (old) {
    next.push({ ...old, tags: tags.length ? tags : old.tags ?? [], note: own || old.note || "" });
    console.log(`그대로 둠: ${url}`);
    continue;
  }
  let got = null;
  try {
    got = await read(url);
  } catch {
    got = null;
  }
  const host = new URL(url).hostname.replace(/^www\./, "");
  next.push({
    url,
    title: cut(got?.title || host, 40),
    note: cut(own || got?.note || "", 80),
    image: got?.image || "",
    tags,
    date: today,
  });
  console.log(`${got ? "읽음" : "못 읽음(주소만)"}: ${url}${got?.image ? "  [섬네일 있음]" : ""}`);
}

data.cards = next;
const json = JSON.stringify(data, null, 2).replace(/<\/script/gi, "<\\/script");
writeFileSync(PAGE, html.replace(block[0], () => `${block[1]}\n${json}\n${block[3]}`));
console.log(`\n카드 ${next.length}장을 index.html 에 적었어요. 파일을 열어 확인해 보세요.`);
