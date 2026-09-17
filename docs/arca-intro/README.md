# 소개글 사용 안내

- `상황극_탐색기_소개글.html`: 아카라이브 붙여넣기용 HTML 원본
- `상황극_탐색기_소개글-미리보기.html`: 로컬에서 화면을 확인하는 파일
- `상황극_탐색기_소개글.md`: Markdown 소개문
- `screenshots/`: 업로드할 원본 PNG
- `상황극_탐색기_스크린샷.zip`: 이미지 업로드용 묶음

아카라이브에 아래 세 이미지를 올린 뒤 HTML과 Markdown의 같은 토큰을 실제 이미지 URL로 바꿉니다.

| 토큰 | 파일 |
|---|---|
| `{{SCREENSHOT_02_LIBRARY_DESKTOP_URL}}` | `02-library-desktop.png` |
| `{{SCREENSHOT_03_LIBRARY_MOBILE_URL}}` | `03-library-mobile.png` |
| `{{SCREENSHOT_04_DETAIL_MOBILE_URL}}` | `04-detail-mobile.png` |

플러그인과 모듈 버튼은 GitHub Release 자산을 직접 가리킵니다. 플러그인 버튼에는 새 창 속성이 없으며 GitHub의 첨부 파일 다운로드 응답을 사용합니다.
