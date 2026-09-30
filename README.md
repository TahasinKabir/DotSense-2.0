# DotSense

Type, speak or scan text → Grade-1 braille → punch it on a GRBL 3018 CNC, and watch the print live.

DotSense 3.0 is the Braille Gcode app, renamed, with the original one-screen layout plus:

- **Live printing over USB** – DotSense talks to the CNC (GRBL) directly. You see each dot as it is punched, the letter, line and cell, % done and time left. Pause, resume and a safe Stop.
- **Auto text** – long text wraps to the paper by itself (lines and pages), and the preview and G-code update while you type or speak.
- **Voice typing** – speak and the words are typed at the cursor. Works offline after a one-time model download.
- **OCR** – read printed Bangla and English from photos, scans and PDF files, offline; phone photos with shadows and uneven light are cleaned up first.
- **Auto correct** – spelling, sentence and punctuation mistakes (English and Bangla) are underlined in the text box as you type; click one for its fixes.
- **Photo from phone** – take a photo with your phone, crop it if needed and send it: it comes straight into DotSense over the machine's WiFi (MKS DLC32) and is read with the same OCR as Scan. **WiFi** at the top left shows if the computer is on the machine's WiFi and joins it in one click.
- **Bangla (বাংলা)** – Bangla voice typing, Bangla OCR and Bangla braille (Bangladesh standard), all offline.
- **Invert print** – mirrored punching for reading from the back: “Hello” is punched as O L L E H, each cell flipped. **Invert view** shows the mirrored machine side next to the reading side, both live.

## Run it

1. Install [Node.js](https://nodejs.org) 22 or newer.
2. Extract this ZIP, open a terminal **in the folder with `package.json`**:
   ```
   npm install
   npm start
   ```

The first `npm start` downloads the Electron runtime (about 100 MB) once, so it takes a minute. On macOS the app is called DotSense and shows the DotSense icon in the menu bar and the Dock also when it runs this way: the first start makes a copy of the runtime named DotSense (a few seconds, in `node_modules/.dotsense-dev`; on an APFS disk it takes no extra space). If that copy cannot start, DotSense starts with the plain runtime instead.

Try the live view without a machine: `npm run simulator` adds **Simulator (no machine)** to the port list.

## The window

Work goes from top left to bottom: **Text**, **Page**, the **Preview** on the right, and **Print** in a bar at the bottom. The top bar stays at the top of the window and the Print bar at the bottom, also when you scroll.

- The bar at the top left, after the name: **WiFi** (the machine's WiFi for Photo from phone: *on* with a green light, or *off*), **Text**, **Page**, **Preview**, **Machine setup**, **Print**, **About**, and the light / dark switch. Text, Page, Preview and Print jump to that part (Text puts the cursor in the text box); the part you are working in lights up.
- At the top right: the machine status (*Not connected*, *DotSense connected*, *Printing 42%*, *DotSense connected · ALARM*…; click it for the connection), and **Open…** / **Save…** for projects.
- **About** shows the developer: Tahasin Kabir Rubai, full stack developer – email (personal and UIU), phone, a professional summary, and the LinkedIn, GitHub, Facebook and WhatsApp logos in the middle (click a logo to open that profile – or a WhatsApp chat – in your browser; hover it for the address). Below it: DotSense's highlights and the **User manual** – a six-step quick start and nine chapters that fold open (the window, entering text, page and paper, preview, machine setup, printing, files, troubleshooting, safety), with the most important points highlighted.
- **More** (under Page, folded) holds what you set once in a while: Invert print, Between pages, the PDF paper size choice, and the G-code with Copy and Save. The G-code listing itself starts hidden (its **Show** switch); Copy and Save work without it.
- The **Print** bar: the machine state and position (or **Connect**), how many pages and about how long, the **Position and paper checked** tick, and **Print page N**, **Print all**, **Pause**, **Stop**. While printing it shows the progress. Messages (*Page 1 punched…*, alarms with Unlock, the sheet change countdown) appear just above it; **✕** closes a message. Hover a greyed-out Print button to see why it is greyed out.
- DotSense remembers the zoom, whether More is open, the last Machine setup tab and the lock.

## Light and dark mode

The round sun / moon button at the end of the top-left bar switches between **dark mode** (the original DotSense look) and **light mode** (white cards, soft shadows, amber accents). DotSense remembers your choice; the separate Invert view window and the window frame follow it. Until you choose, it follows your system setting. The braille sheet in the preview stays paper-coloured in both.

## Machine setup (read first)

**Machine setup** (in the top-left bar, before Print) holds what belongs to the machine and the punch, set once. The rest of the window rests while it is open, but the Print bar stays usable (Pause and Stop). **Esc**, **✕** or a click beside it closes it. Four tabs:

- **Calibration guide** – eight steps from connecting to locking the values, with buttons to the tab each step needs.
- **Machine values** – start position, print area, dot / cell / line pitch, Z heights, feed and dwell. They start **locked** (read-only): switch **Lock these values** off to change them, and on again when done. **Reset defaults** (only while unlocked, after a question) puts back the standard machine values; the paper settings stay. The **Live preview** next to them changes as you type: the sheet from above (paper, print area, the start position, the dots of the page and the machine's reach from X0 Y0 – red when the print area goes past it), the braille spacing with the dot, cell and line pitch in mm (at the Braille size in use), and the Z heights from the side (clearance, the paper at Z0 and the punch depth).
- **Tool Box** – jog, set zero, Go to start position, Unlock, Soft Reset, Check (auto calibrate: see Live printing). **Live position** under the buttons shows where the punch is, live, as the machine reports it: from above over the paper and the machine's reach, and its height against Z0, clearance and punch depth.
- **Connection** – USB port, baud rate, Connect / Disconnect, the machine log and a command line.

The values:

- **Start position = the first dot** (dot 1, top-left of the first letter), in work coordinates (mm). Letters go to **+X**, dots 2/3 and following lines go to **−Y**.
- **Print area** is measured from the start position: width to the right, height downwards. The app shows how many cells and lines fit per sheet and the X/Y range of the dots on each page.
- The default start is now **X 10, Y 135** (the old one-line app used Y 15). Multi-line pages need room below the first line, so set the start Y near the top edge of your paper.
- Z: **Clearance Z** is above the paper, **Punch depth Z** is below it. Set Z0 on the paper surface.
- Every page ends at clearance height and returns to X0 Y0, like the original app.

## Page (paper size)

In **2 Page**, switch on **Use paper size** and pick the sheet: A4, 10 × 15 cm, 13 × 18 cm, A6, A5, B5, 9 × 13 cm, 13 × 20 cm, 20 × 25 cm, 16:9 wide, 100 × 148 mm, Envelope #10 / DL / C6, Letter, Legal, A3, A3+, A2, B4, B3, or **User-Defined** (type width and height). Choose **Portrait** or **Landscape** and a **Margin** for all sides; the **cm** / **mm** buttons next to it pick the unit you type it in.

DotSense then sets the start position and print area for you (shown dashed, “from paper size”) and centres the text left-right. The dots start **2 mm inside the margin line** (the dashed line in the preview), measured to the edge of the dot: the first line sits 2 mm under the top line, and no dot comes closer than 2 mm to any side. Set **X/Y zero at the paper's front-left corner** (bottom-left of the page, top edge toward the back of the machine). If the sheet is bigger than the machine can reach (a typical 3018 moves about 300 × 180 mm; once connected DotSense uses your machine's own limits), a warning says so and offers the fix as a button: **Switch to Landscape**, **Use a 2.8 cm margin** (the smallest margin up to 4 cm that fits), or both together.

Switch it off to go back to your own start position and print area – your values are kept.

**Braille size** sets the size of the braille, like the scaling in a print dialog:

- **Fit to printer margins** (the standard) – the braille grows or shrinks (50–200 %) so the text fills one sheet inside the margins. With page breaks, each page fits on one sheet. Text too long for one sheet even at 50 % goes on to the next sheets.
- **Reduce to printer margins** – shrinks only when the text does not fit on one sheet; never bigger than 100 %.
- **Custom scale** – your own size, 50–200 % (100 % = your own dot, cell and line pitch). A size too big for the paper is refused.

**Nothing is punched outside the page:** with a paper size, every dot stays on the paper inside the margins (2 mm in from the margin line), and DotSense checks every dot again before the machine moves – if one reached past the margin line, it prints nothing. (It relies on X/Y zero at the paper's front-left corner.)

The line below shows the size and spacing in use. DotSense warns when dots get closer than standard braille (2.5 mm): check that your punch can do that. With Fit and Reduce the size follows the text while you type, so the start position can move – DotSense then clears **Position and paper checked** so you check it again. Your pitches in the settings stay as they are.

**Choose paper size by PDF page size** (in **More**) – when you scan a PDF (**Scan (OCR)…**), DotSense sets the paper size and orientation from the PDF's first page: the listed size if one matches (within 2 mm), otherwise User-Defined.

## Between pages

When you print several pages, DotSense stops after each sheet, beeps, and shows a countdown: **the next page starts by itself after 30 seconds** (change the seconds next to the **Next page starts after** switch in **More › Between pages**, 5 to 3600). In the last 5 seconds it beeps every second. **Continue now** starts at once, **Wait** stops the countdown until you press Continue, **Stop here** ends the job. It only starts if the machine is connected and Idle. Switch it off to always wait for Continue.

Keep your hands away from the punch when the countdown is running.

## Invert print (mirror)

The punch comes down from the top, so the bumps form on the underside. **Invert print** (in **More**, on by default) mirrors the whole page so it reads correctly when you turn the sheet over, left to right:

- letters are punched in reverse order – “Hello” → **O L L E H** – across the full print width, so a short line sits on the right of the sheet (top view) and on the left after turning it over;
- the dots inside every cell are flipped too (1↔4, 2↔5, 3↔6), otherwise letters like d/f or e/i would read wrong.

It applies to live printing, **Save page** and **Save all** (file names end in `_invert`). The preview shows the reading side. The green **Invert view** button (shown while Invert print is on; red **Invert off** when it is off) puts the mirrored machine side on the right, next to the reading side, so you can watch both live while printing – the machine starts each line on the left of the machine side. DotSense remembers whether it is open. The small **↗** above the machine side opens it in its own window too. Turn Invert print off if your machine punches from below.

## Braille preview

The preview shows the page at its real shape. With a paper size it is the sheet itself – A4 looks like A4, landscape looks like landscape – with the margins dashed and every dot exactly where it will be punched. Without a paper size it shows the print area. Letters are shown above the cells when they are big enough to read; hover a cell to see its letter.

**Fit page** shows the whole sheet with the braille text and the Print bar in the window; **100 %** shows it at real size (on a normal screen) and **200 %** twice as big – the box then scrolls.

**Braille text** under the sheet is the page as Unicode braille (⠓⠑⠇⠇⠕ …), line by line as it reads, for proofreading, braille displays and screen readers. **Copy** puts it on the clipboard.

The Print bar says how long the text takes (*2 pages · about 14 min*). While printing, its progress line shows the **time left** for the job as hours:minutes:seconds (*00:14:11 left*), counting down second by second, corrected by the real speed of the machine, and holding while paused.

## Live printing

1. Plug in the machine. In **Machine setup › Connection** press ⟳, choose its port (usually `COM3` / `ttyUSB0` / `cu.usbserial…`), 115200 baud, **Connect** – next time **Connect** in the Print bar is enough. Close Candle/UGS first – only one program can use the port.
2. Open **Machine setup › Tool Box** if you need to move the head, set **X/Y zero** at your paper corner and **Z zero** on the paper. **Go to start position** moves above the start position at clearance height, to check alignment. The jog **Step** is 0.1, 1 or 10 in **mm** or **cm** (cm moves ten times further; Z moves at most 10 mm per click, and no move is longer than the machine's travel). **Unlock** clears an ALARM lock ($X). **Soft Reset** (Ctrl+X) resets the GRBL controller without switching the machine power off – use it if GRBL is stuck, a job needs to be aborted, or you need to reset the controller. It works during a print too and aborts it at once (all remaining pages as well); **Stop** is the gentle way (hold, reset, lift the punch). A reset while the machine moves can leave GRBL in ALARM: press **Unlock**, lift the punch with Z+ and check the position before printing again. **Check** (auto calibrate) shows where the punch will work before anything is punched: the punch goes **5 mm up**, moves once around the **4 sides of the margin line** (the paper inside its margins; without a paper size, the print area) and goes back to the **start position** at clearance height, like Go to start position. The path must stay on your paper, just inside its edges – if not, move the paper or set X/Y zero again. ■ in the jog buttons stops it at once. GRBL's own check mode ($C, test G-code without moving) is still there: type `$C` in Machine setup › Connection.
3. Tick **Position and paper checked** (you checked the start position, print area and Z depth for your machine, and the paper is clamped), then **Print page N** or **Print all pages**.
4. While printing: dark dots are punched, the pulsing dot is the current one. **Pause** is a GRBL feed hold. **Stop** does feed hold → soft reset (keeps position) → lifts the punch to clearance.
5. With several pages, DotSense stops after each sheet so you can put in the next one at the same place; the next page starts by itself after the countdown (see Between pages).

Text and settings are locked while printing. Stay near the machine and its power switch – software stop is not an emergency stop.

## Auto correct and Clear

**Auto correct** is on from the start (the **Auto correct** button switches it off and on; DotSense remembers which). It checks the text as you type – English and Bangla – and **underlines each mistake right in the text box**: red for spelling, amber for sentences and capitals, blue for punctuation, and a small blue ring where a mark is missing. **Click an underlined word** and its fixes appear next to it – for example **sentense** → *sentence*, **im** → *I'm* / *I am* – with **Ignore** and, for spelling, **Add to dictionary** (for a name). A **right-click** on it shows the same fixes above Cut, Copy and Paste, and **Ctrl+.** (⌘. on a Mac) opens them from the keyboard (Esc closes them). Only real mistakes are marked: names in the middle of a sentence, short forms like NASA, links and e-mail addresses are left alone.

The panel under the buttons counts the mistakes and lists them (the **Show suggestions** switch hides the list and keeps the count; it is remembered). Each entry shows the place in the text (click it to select it there), why, and the choices. **Fix all** makes every fix that is sure – the rules and common misspellings; spelling guesses from the dictionary you choose yourself. Every fix is one edit: **Undo** (Ctrl+Z / ⌘Z) takes it back. It all works offline.

- **Spelling:** about 300 common misspellings are known at once (sentense, recieve, definately, teh, wich…); every other word is looked up in British and American dictionaries, with the closest suggestion first. After an update, run `npm install` once so the dictionary is there (Auto correct says so if it is missing).
- **Sentences:** subject and verb (*he go* → *he goes*, *they goes* → *they go*, *I has* → *I have*, *there is many* → *there are many*, *this are* → *these are*), *I seen* → *I saw* / *I have seen*, *he use to* → *used to*, *its* / *it's*, *your* / *you're*, *there* / *their* / *they're*, *to* / *too*, *more taller* → *taller*, double negatives (*don't know nothing* → *anything*), *Me and him went* → *He and I went*, missing apostrophes (dont → don't), *a* / *an*, *then* / *than*, *could of* → *could have*, the same word twice, words written together (*alot* → *a lot*).
- **Punctuation:** a question ends with **?** (*How are you.* → *How are you?*, also *…, isn't it*), one mark instead of two (*!!* → *!*, *,,* → *,*, *..* → *.* or *…*), a comma after an opening word (*However we* → *However, we*; *Yes I* → *Yes, I*), spaces before or after marks and inside brackets, two spaces, and a full stop at the end of a paragraph of four words or more (not after a title or a list line; *What a day* gets *!* or *.*).
- **Capitals:** the start of a sentence, *I*, days, months, languages and places (*monday* → *Monday*, *english* → *English*, *dhaka* → *Dhaka*).
- **Bangla:** । (danda) instead of a full stop, **?** after a question word (*তুমি কেমন আছ।* → *?*; not *কি না*), spaces before or after । , ? !, a double danda, a missing danda at the end of a paragraph, the same word twice (not when it is repeated on purpose, like ধীরে ধীরে), and about 130 common spelling mistakes with the Bangla Academy spelling (পরিক্ষা → পরীক্ষা, কারন → কারণ, বাড়ী → বাড়ি), also with an ending (কারনে → কারণে). Bangla has no full dictionary check: a complete Bangla dictionary would need far too much memory.

**Clear** (after Next page) empties the text box after asking first; Undo brings the text back.

## Voice typing

Press **Voice typing**. The first time, choose a model to download (once, from the sherpa-onnx GitHub releases):

- **Accurate · 111 MB** – best for accented English and voice commands (recommended).
- **Fast · 30 MB** – smaller and quicker, less accurate.

Then speak; words appear at the cursor and the braille updates. Say **"new line"**, **"new paragraph"** or **"new page"** on their own. Speech never leaves the computer. On macOS allow microphone access when asked.

**Bangla:** pick **বাংলা** next to Voice typing (Scan reads Bangla and English by itself). The first time, DotSense offers **Download Bangla · 87 MB** – an offline Bangla speech model (Vosk small streaming Bengali, Apache-2.0, via sherpa-onnx). Bangla voice commands: **"নতুন লাইন"**, **"নতুন অনুচ্ছেদ"**, **"নতুন পাতা"** (also "নতুন পৃষ্ঠা", "নতুন পেজ"). The voice model list in the voice bar has **বাংলা · 87 MB** too.

## OCR (images and PDF)

**Scan (OCR)…** or drop files on the window. PNG, JPG, BMP, WebP and PDF. It reads **Bangla and English by itself** – also mixed on one page, whatever the English / বাংলা switch says (that switch is for voice typing) – with the models that come with the app (tesseract.js, English and Bangla "best" data; nothing is downloaded, nothing leaves the computer). Pictures from a scanner, a camera and **Photo from phone** all go the same way:

1. **Cleaned up:** turned upright (a camera photo's turn note), made grey, and the paper made evenly white – shadows, a dim corner and uneven lamp light are divided out; tiny pictures are doubled, huge ones made smaller. The engine then separates ink from paper place by place, so a photo reads like a scan.
2. **Read** with the Bangla and English models together. In a Bangla line, a Latin "word" the engine is unsure of is almost always a Bangla word it misread (the letters that used to come out as *TR), SHEE, FER…*): it gets a second look with the Bangla model alone. A stray Bangla digit in an English line gets a second look in English.
3. **Put together:** junk from the edges of a photo (the table, the page border, shadows) is dropped; the lines of each paragraph are joined (the braille makes its own lines) and a word broken at a line end is put back together; a danda read as | is made । again, and stray spaces go. Tick **Keep the picture's line breaks** for poems and lists.

On 24 test photos of Bangla, English and mixed pages the share of wrong letters went from 32 % to under 1 % in dim light, from 46 % to 7 % with a strong shadow, tilt and blur, and from 2 % to 1 % for ordinary photos; Bangla pages that came out as Latin letters now read as Bangla. PDF pages with Bangla text are always read with OCR, because the text stored in Bangla PDFs usually comes out scrambled. Choose **Replace** or **Add after** the current text, a PDF page range, **OCR every PDF page** for scans, and optionally a new braille sheet per source page. Always read the text after scanning – very blurred photos still have mistakes.

## Machine WiFi and Photo from phone

**WiFi** at the top left shows whether this computer is on the machine's WiFi – the MKS DLC32 board's own network **MKS_DLC** (password **12345678**): **on** with a green light, or **off** without a light. When it is off, **one click joins it** – no questions. (On Windows the network is kept as "connect manually", so it never takes over your internet by itself.) Click it while on for the details or to change the name and password; **Default name and password** puts back MKS_DLC / 12345678. On the machine's WiFi the computer has no internet unless a cable is plugged in – pick your usual WiFi in the system WiFi menu to go back. Printing still uses the USB cable.

**Photo from phone** is in **Scan (OCR)…**. Press **Use phone camera**, then:

1. Put the phone on the same WiFi. For MKS_DLC, choose **Phone WiFi** under the code and scan it with the phone camera – the phone joins the machine's WiFi (needed once).
2. Choose **Camera page** and scan the code with the phone camera (or type the address shown under it).
3. Tap **Take photo** (or **Choose from gallery**). The photo waits on the phone with **Send**, **Crop** and **Remove**:
   - **Crop** opens the photo with a frame: drag its corners or edges to resize it, drag inside it to move it; **Done** keeps the crop (**Reset** = the whole photo, **Cancel** or the phone's Back button = no change). Tap Crop again to change it; tapping the small photo opens it too.
   - **Remove** throws the photo away; nothing was sent.
   - **Send** sends it (with several photos waiting: **Send all**). The photo appears in the Scan window and its text goes into the text box – nothing to click on the computer.

The first photo follows **Put the text** (Replace / Add after); the next ones are added after it. If Scan is closed, a photo opens it and is always added after your text. Click a small photo in the Scan window to see it large; **Remove photo** there takes the photo out, together with the text it put in the text box (if you changed that text, the text stays). The phone page shows **Connected to PC** and **On your PC ✓** for each photo; the phone sends each photo **as it is** – the same file, at full size – so the computer reads it with exactly the same OCR as when you choose that image in Scan (OCR) (a camera photo lying sideways is turned upright the same way). Only a crop, or a photo the computer cannot read (HEIC), is made into a full-size JPEG on the phone first.

The link stays on – also after DotSense restarts – until you press **Stop**, and its address stays the same, so the phone page can stay open (or be bookmarked). Only that secret link works, only photos are accepted (up to 25 MB), and nothing is saved on the computer.

If the phone cannot open the page:

- **Windows Firewall** asks the first time: allow DotSense and tick **Public networks** too (a new WiFi such as MKS_DLC counts as public).
- Phone and computer must be on the same WiFi. **Android** on the machine's WiFi (it has no internet): turn mobile data off, and choose to stay connected when the phone asks.
- If the phone still cannot reach the computer on MKS_DLC, put both on your usual WiFi instead: Photo from phone works on any shared WiFi, and the code always shows the computer's current address.
- **Windows 11** tells apps the WiFi name only when **Location** is on (Settings › Privacy & security › Location, also "Let desktop apps access your location"). Without it DotSense reads the name from the network list; if that fails it shows **WiFi ?** – connecting still works.

## Braille rules

Grade-1 (uncontracted) English: A–Z, digits with the number sign (and the letter sign when a–j follows a number), and `, ; : . ! ? ' -`. Capitals are not marked.

Signs and symbols follow **Unified English Braille (UEB)** – the same cells as liblouis (en-ueb-g1), which the tests check against. Every sign and letter of liblouis's UEB table is in (about 230 signs and 90 letters); only its few Cyrillic letters are not:

- **Keyboard signs:** `@ # $ % & * + = / \ _ ~ ^ | < > ( ) [ ] { } " \``
- **Quotes and dashes:** “ ” ‘ ’ „ « » (straight `"` becomes an opening or closing quote by its place; ’ inside a word is an apostrophe), – — ― − and …
- **Money and marks:** € £ ¥ ¢ ₣ ₦ ¤ © ® ™ § ¶ ° • † ‡ ′ ″ · ¡ ¿ ¬ ¦ µ
- **Maths:** ± × ÷ − ≠ ≤ ≥ ≈ ≡ ∞ √ ∫ ∑ ∏ ∂ ∇ ∀ ∃ ∈ ∉ ⊂ ⊆ ∩ ∪ ∧ ∨ ∠ ⊥ ∴ ∵ and more, fractions ½ ¼ ¾ ⅓ ⅔ ⅕–⅘ ⅙ ⅚ ⅐ ⅛ ⅜ ⅝ ⅞ ⅑ ⅒, and ² ³
- **Arrows, shapes and others:** ← ↑ → ↓ ↖ ↗ ↘ ↙ ⇒ ⇐ ⇑ ⇓ ↵, ■ □ ▲ △ ○ ●, ♭ ♮ ♯, ♀ ♂, ✓ ✔
- **Greek:** α β γ δ … ω (π, μ, Ω …)
- **Accented and other letters:** é è ê ë ñ ç å ā ă č and more (the accent sign, then the letter), ø ł đ ß æ œ ð þ ŋ ə; the ligatures ﬁ ﬂ ﬀ from PDFs become their letters

Numbers keep going through a decimal point or comma (3.14, 1,000). Where a sign could be misread, the grade 1 sign (dots 5-6) comes first, like UEB: a lone `?`, and `, ; : !` between letters (a,b). A sign made of several cells shows its print sign on its last cell in the preview; point at a cell to see what it is. Characters that are still not in the table (₹, ৳, emoji …) are listed in a warning and punched as blank cells.

**Next page** starts a new sheet at the cursor and writes `[[New Page 3]]` on a line of its own – the number is the page it starts (after page 2, it is page 3). The numbers follow the text: when a page is added before a break, its number goes up (they are updated when you press Next page and when you leave the text box, not while you type). You can also type `[[New Page]]`; `[[PAGE]]` from older projects still works and becomes `[[New Page …]]`. Scan's **Start a new braille sheet for each source page** and the voice command "new page" write the same break. **Undo** (Ctrl+Z / ⌘Z) takes a break back in one step.

**Bangla braille** follows the Bangladesh standard (Bharati braille as used in Bangladesh). English and Bangla can be mixed in one text.

- Vowels and vowel signs share cells (আ / া ⠜, ই / ি ⠊ …); consonants as in the Bengali Braille tables; ং ⠰, ঃ ⠠, ঁ ⠄, ঽ ⠂, । ⠲.
- খ ⠭, ঝ ⠵, ভ ⠧, ঢ় ⠷ and ৎ ⠐⠞ are the Bangladesh forms (India's Bharati uses ⠨, ⠴, ⠘, ⠐⠻ and ⠈⠞ for these).
- Halant (্) is written **before** the consonant it kills: ধর্ম = ⠮⠈⠗⠍. ক্ষ ⠟ and জ্ঞ ⠱ have their own cells; ড় ⠻, য় ⠢.
- A vowel letter right after a consonant gets the inherent অ (⠁): কই = ⠅⠁⠊ (কি = ⠅⠊).
- Bangla digits (০–৯) use the number sign like English digits; a letter right after a number gets the letter sign ⠰.
- The G-code comments are ASCII, so Bangla is written there in Latin letters (e.g. `; TEXT: AAMAARA SONAARA BAANGLAA`).

Sources: Wikipedia “Bengali Braille” (Bangladesh and India tables), liblouis `bengali.cti` (Braille Council of India) and the *Standard Bharati Braille Codes*. Please have a braille reader check your first Bangla pages.

## Files

Save the current page as `.gcode`, all pages as a ZIP, or a DotSense project (`.json` with text and settings). Braille Gcode 2 projects open too.

## Build an installer

```
npm run dist
```
Builds for the OS you run it on (`.exe` on Windows, `.dmg` on macOS, `.AppImage` on Linux), in `dist/`.

## Tests

```
npm test
```
Checks braille layout (same dot positions as the original app for one-line text), the UEB signs, quotes, accents and numbers (the same cells as liblouis en-ueb-g1), Bangla braille (both standards), wrapping and pages, paper sizes and page scaling (Fit / Reduce pick the largest size that fits), invert print (turning the punched sheet over gives exactly the normal braille), G-code, Auto correct (each rule on mistakes and on right sentences that must stay unmarked, questions, Fix all), the GRBL streamer against a simulated GRBL (buffer never overflows, pause, stop, alarms, errors, unplug, GRBL 0.9), voice model unpacking, the WiFi status on Windows, macOS and Linux, and the phone link (secret address, photos only, size limit, QR codes).

## Troubleshooting

- **Port busy / Access denied** – close Candle, UGS or Arduino IDE.
- **No ports listed (Windows)** – install the CH340 USB driver for your board.
- **Linux: Permission denied** – `sudo usermod -a -G dialout $USER`, then log out and in.
- **No reply from GRBL** – check the baud rate (115200 for GRBL 1.1) and the USB cable.
- **ALARM** – check the machine, then **Unlock**. After a limit alarm set zero again.
- **Phone cannot open the page** – see Machine WiFi and Photo from phone.

## Code

- `core.js` – braille translation (English and Bangla), auto-wrap, page layout, G-code, time estimate
- `renderer.js`, `index.html`, `styles.css` – the main window (`theme.js` sets light or dark mode before the window is drawn)
- `invert.html`, `invert.js` – the machine side in its own window (↗)
- `grbl.js` – GRBL streaming, status, live progress, pause/stop
- `fake-grbl.js` – GRBL simulator for tests and `npm run simulator`
- `main.js`, `preload.js` – Electron main process, files, OCR, serial port
- `ocr-text.js` – OCR text: the second looks, junk out, paragraphs joined, small repairs (Bangla and English)
- `checker.js`, `spell-worker.js` – Auto correct: the rules, and the English dictionary
- `voice-worker.js`, `voice-models.js`, `capture-worklet.js` – offline voice typing (English and Bangla)
- `wifi.js` – this computer's WiFi: status and one-click join (netsh / networksetup / nmcli)
- `phone-server.js`, `phone-page.html` – Photo from phone: the small web server, QR codes and the phone's camera page
- `scripts/start.js` – `npm start`; on macOS it runs the runtime under the DotSense name and icon

---

Profile logos in About (Profiles shows only the logos, each opens its website): `brand/linkedin.png`, `brand/github.png`, `brand/facebook.png` and `brand/whatsapp.png` (.png or .svg; put in or replace the official files – without a file About shows a simple icon). App icon: `build/icon.png` (and `icon.icns` / `icon.ico` made from it for macOS and Windows).

Developed by **Tahasin Kabir Rubai** · © 2026 · [GitHub](https://github.com/TahasinKabir) · [LinkedIn](https://www.linkedin.com/in/tahasin-kabir)
