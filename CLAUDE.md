# link-cards

이 저장소는 스킬 하나입니다. 사용자가 링크를 주며 모아보기 · 카드 정리를 부탁하면 `SKILL.md` 를 읽고 그대로 따릅니다.

- 고치는 곳은 `index.html` 맨 아래 `<script id="cards">` 의 JSON 뿐입니다.
- 링크 읽기는 `node tools/read-links.mjs`(links.txt → index.html)를 먼저 씁니다.
- 섬네일을 지어내지 않습니다. 없으면 `"image": ""`.
- 사용자는 코드를 모를 수 있습니다. 끝나면 「index.html 을 더블클릭하면 열려요」 한 줄로 알립니다.
