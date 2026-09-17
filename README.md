# 상황극 탐색기 + 상황극 서고

아카라이브에서 선별한 짧은 상황극을 전용 모듈 **상황극 서고**의 비활성 로어북으로 보관하고, 플러그인 **상황극 탐색기**에서 찾아 현재 채팅에 지침으로 넣는 API v3 플러그인입니다.

배포용 소개문과 스크린샷 자료는 [docs/arca-intro](docs/arca-intro)에 있습니다.

## 설치와 업데이트

- 공식 웹 RisuAI용 설치 파일: [최신 GitHub Release](https://github.com/canister2668/risuai-scenario-library/releases/latest/download/scenario-library.plugin.js)
- 상황극 서고 모듈: [Proton Drive 공유 폴더](https://drive.proton.me/urls/T67TA9HZ6R#SMKnYZym7F70)
- 현재 버전: `1.0.0`
- 업데이트 주소: `https://raw.githubusercontent.com/canister2668/risuai-scenario-library/main/update/scenario-library.plugin.js`

Proton Drive에서 상황극 서고 모듈을 받아 모듈 설정에서 먼저 가져오고, GitHub Release의 `scenario-library.plugin.js`를 플러그인 설정에서 가져옵니다. 이후에는 RisuAI가 파일 상단의
`//@update-url`을 확인하여 새 버전을 표시합니다. GitHub Release에는 플러그인과 `SHA256SUMS`만 제공합니다.

## 사용 흐름

1. Proton Drive에서 받은 상황극 서고 모듈과 GitHub Release에서 받은 상황극 탐색기 플러그인을 차례로 공식 웹 RisuAI에 설치합니다.
2. 채팅 입력창 오른쪽의 햄버거 메뉴를 열고, 전용 배지가 붙은 **상황극 탐색기**를 고릅니다.
3. 맨 위 검색창에 제목·줄거리·지침을 입력하거나, 그 아래 분류 칩(전체 / ★ 즐겨찾기 / ◷ 최근 / 폴더)을 고릅니다. 칩에는 항목 수가 함께 표시됩니다.
4. 최신순/제목순/오래된순 정렬과 `19금 포함 / 19금 숨김 / 19금만` 표시 설정을 고릅니다. 기본값은 **19금 포함**입니다.
5. 목록은 한 줄에 제목·짧은 줄거리·분류·`19+`·날짜·작성자를 담은 행으로 보여 주고, 30개씩 늘어납니다. 아래로 스크롤하면 한 번에 한 쪽씩 자동으로 더 불러옵니다.
6. 행을 눌러 상세를 열고, **일반봇 / 시뮬봇** 두 칸짜리 선택에서 하나를 고릅니다. 시뮬봇은 입력한 대상 이름으로 정확한 `{{char}}` 토큰만 치환하며, 최근에 쓴 대상 이름을 칩으로 다시 고를 수 있습니다.
7. 아래 고정 바에서 **채팅에 추가**를 누르면 한 번에 들어갑니다. 손보고 싶으면 **다듬기**로 인풋카드를 열어 고친 뒤 추가합니다.

모바일에서는 화면 전체를 사용하고, 태블릿과 PC에서는 중앙 패널로 열립니다. 큰 화면에서는 패널 바깥을 누르거나 **나가기**를 눌러 닫을 수 있습니다.

AI 응답은 자동 생성하지 않습니다. 선택지 모듈과 같은 방식으로 공식 `getChatFromIndex` / `setChatToIndex` API를 통해 유저 메시지만 하나 추가합니다.

## 인풋 정제

- 원문 보관본은 배포물 밖의 유지보수 아카이브에 남기고, `상황극 서고` 모듈의 `content`에는 정제된 인풋만 저장합니다.
- 플러그인 스토리지에는 빠른 탐색용 목록·줄거리·출처 메타데이터만 두며 상황극 본문을 중복 저장하지 않습니다.
- 아카라이브 시리즈 목록 뒤의 `▼ / ▲` 구분부, 명시적인 OOC 지침 앞의 게시자 잡담, 제로폭 문자, 불필요한 줄 끝 공백을 제거합니다.
- OOC 지침 내부의 URL, 마크다운, HTML 형태 문자열, `{{user}}`, `{{char}}`와 줄바꿈은 보존합니다.
- 정제 결과가 상세 화면의 **채팅에 들어갈 본문**에 그대로 표시되므로 전송 전에 확인할 수 있고, **다듬기**에서 직접 수정할 수 있습니다.

## 내장 저장소

- 2026-09-17까지 수집한 상황극 후보 532개의 메타데이터 seed가 플러그인에 포함되고, 본문은 모듈에만 포함됩니다.
- `상황극 서고` 모듈에는 `일상·코미디 / 로맨스 / 갈등·화해 / 사건·모험 / 성인 / 기타` 폴더와 정제된 비활성 로어북이 들어 있습니다.
- 보관함을 열 때는 플러그인 스토리지의 약 380KB 목록만 읽습니다. 첫 상세 선택에서 모듈을 한 번 읽고 이후에는 메모리에서 사용합니다.
- 플러그인 스토리지가 없는 새 설치나 캐시 삭제 뒤에는 모듈의 표준 항목과 플러그인 내장 seed를 합쳐 목록·출처·수집 범위를 자동 복구합니다.
- **저장소 관리**에서 실제 사용량과 항목 수를 확인하고, 목록 캐시만 비우거나 즐겨찾기·최근 기록·초안을 포함해 모두 비울 수 있습니다. 두 작업 모두 모듈은 삭제하지 않습니다.
- 탐색기에서 추가·수정·가져오기를 수행하면 표준 모듈 원본을 먼저 저장·재검증한 뒤 소형 메타데이터 캐시를 갱신합니다. 모듈 편집기에서 직접 바꾼 내용은 탐색기 메뉴의 **모듈에서 새로고침**으로 반영할 수 있습니다.
- 기존 저장소가 있으면 출처 게시글 ID로 중복을 피하면서 빠진 내장 항목만 보충합니다. 사용자가 수정한 항목은 덮어쓰지 않습니다.
- 모든 상황극은 `key: ''`, `alwaysActive: false`라서 자동 발동하지 않습니다.
- 18+ 자료를 제외하지 않으며 `18+` 배지와 성인 분류를 유지합니다.
- 목록은 30개씩 늘려서 표시합니다. 즐겨찾기와 최근 사용 30개를 지원합니다.
- 긴 원문은 상세에서 접어 두고(‘전체 보기’로 펼침), 목록과 상세 첫 화면에는 짧은 줄거리만 표시합니다. 줄거리가 제목과 사실상 같으면 본문 첫 서술을 대신 보여 줍니다.
- `19+` 표식은 수집 당시의 민감 표시나 `성인` 분류 중 하나라도 해당하면 붙습니다.

직접 만든 상황극도 **직접 저장**으로 같은 모듈에 추가할 수 있습니다. 모듈 저장소 JSON 백업도 지원합니다.

## 재수집 및 빌드

새 수집본을 반영할 때만 아래 순서로 실행합니다. 사용자는 별도 JSON을 가져올 필요가 없습니다.

```sh
node scenario-library/tools/crawl-arcalive.mjs \
  --manifest scenario-library/crawl-output/arcalive-characterai-...-manifest.json \
  --output scenario-library/crawl-output
node scenario-library/tools/build-seed.mjs
node scenario-library/build.cjs
```

버전은 `package.json` 한 곳에서 관리합니다. 빌드는 공식 설치본과 업데이트 서버 파일을 같은
바이트로 만들며, `node scenario-library/tools/prepare-release.cjs`는 GitHub Release에 올릴
설치 파일과 체크섬을 `release/`에 준비합니다. `v*` 태그를 푸시하면 GitHub Actions가 버전,
테스트, 업데이트 파일 동기화를 확인한 뒤 Release 자산을 생성합니다.

`build-seed.mjs`는 후보 글만 골라 줄거리와 분류 메타데이터를 만들고 `src/seed.json`에 저장합니다. 분류는 제목과 본문의 키워드에 따른 보조 분류이므로 플러그인에서 폴더를 추가하거나 항목을 수정할 수 있습니다.

## 증분 유지보수

현재 수집 범위는 다음 명령으로 확인합니다.

```sh
npm run maintenance:status
```

최신 `로어북` 탭에서 기존 수집 인덱스와 겹치는 지점까지만 훑고 새 글의 본문만 가져오려면 다음을 실행합니다.

```sh
npm run maintenance:check
```

결과는 `maintenance/inbox/`에 원문 보관본과 플러그인용 `scenario-library-import-*.json`으로 생성됩니다.
플러그인의 **일괄 가져오기**에서 후보를 확인·선택해 저장한 뒤, 같은 파일로 수집 인덱스를 전진시킵니다.

```sh
node tools/update-crawl-index.mjs --input maintenance/inbox/scenario-library-import-....json
```

플러그인 스토리지는 저장된 상황극 수와 별도로 `탭 확인일 / 당시 최신 게시글 ID와 날짜`를 보존하고 목록 상단에 표시합니다.
따라서 후보가 하나도 없던 갱신에서도 탭을 어디까지 검사했는지 구분할 수 있습니다.

## 검증

```sh
node --test scenario-library/tests/core.test.cjs
node --test scenario-library/tests/upstream-contract.test.cjs
node scenario-library/tests/browser.cjs
node scenario-library/tests/full-import.cjs
```

`upstream-contract.test.cjs`는 `reference/upstream.json`에 고정한 공식 RisuAI `main` 커밋의
API v3 선언과 실제 채팅 메뉴·아이콘 렌더러를 대조합니다. 배포용
`dist/scenario-library.plugin.js`는 모듈과 함께 설치하는 순정 웹용 소형 설치본입니다. 본문까지 내장해 플러그인 하나로 모듈을 만들 수 있는
`dist/scenario-library-standalone.plugin.js`는 복구·개발용이며 일반 배포에는 사용하지 않습니다.

브라우저 검사는 진입 버튼이 실제로 그려지는 경로부터 확인합니다. 공식 클라이언트에서 채팅 입력창 오른쪽
버튼은 `DefaultChatScreen.svelte`의 자체 메뉴를 열고, 그 메뉴는 `additionalChatMenu`만 훑습니다. 그래서
등록 위치는 `chat`이어야 하며(`hamburger`는 왼쪽 사이드바 아이콘 열로 갑니다), 검사는 등록 위치와 함께
`PluginDefinedIcon`이 쓰는 DOMPurify 설정·20px 아이콘 칸을 그대로 재현해 배지가 살아남는지, 20px에서
읽히는지, 그 줄을 눌렀을 때 탐색기가 열리는지까지 확인합니다.

이어서 데스크톱 1100px와 모바일 390px에서 로딩 중 즉시 닫기, 지연 본문 읽기, 더 보기/스크롤 자동 로드, 19금 필터 양방향, 즐겨찾기·최근, 검색, 줄거리 상세, `{{char}}` 치환, 상세에서 바로 채팅에 추가, 인풋카드 추가, 중복 클릭 방지, 동시 수정 거부와 가로 넘침을 확인합니다. Risu API는 테스트 더블이므로 실제 운영 사이트 설치와 실브라우저 통합 검증은 별도 단계입니다.

서버 코어, 전역 프리셋, 모델 제공자 수정은 필요하지 않습니다. 운영 사이트에는 자동 설치하지 않습니다.

## 라이선스

플러그인 코드와 문서는 [MIT License](LICENSE)로 배포합니다. 내장 상황극 본문과 출처 메타데이터의 권리는 각 원저작자에게 있으며 MIT 적용 대상이 아닙니다. 자세한 범위는 [NOTICE](NOTICE)를 확인해 주세요.
