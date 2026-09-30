/*
 * DotSense Auto correct: finds mistakes in the text and suggests fixes, in English and Bangla.
 * Offline and rule based:
 *  - spelling: common misspellings (sure fixes, no dictionary needed); every other English word is
 *    looked up in a dictionary (spell-worker.js), whose answers are passed in as `spell`
 *  - sentences: subject and verb (he go, they goes, I seen), its / it's, your / you're, there /
 *    they're, a / an, then / than, too / to, double negatives, this are, there is many...
 *  - punctuation: a question ends with ?, one mark instead of two, a comma after an opening word,
 *    spaces around marks, the end of a paragraph
 *  - capitals: sentence starts, I, names, days, months and languages
 *  - Bangla: । (danda), ? after a question word, spaces, common spelling mistakes (Bangla Academy)
 * Each suggestion: { start, end, found, kind, why, options, rank, sure, key, id }; `sure` ones are
 * safe for Fix all. Runs in the app window (window.DotSenseCheck) and in Node for tests.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ English word lists
  // Missing apostrophes: the short form and the long form
  const CONTRACTIONS = {
    im: ["I'm", 'I am'], ive: ["I've", 'I have'],
    dont: ["don't", 'do not'], doesnt: ["doesn't", 'does not'], didnt: ["didn't", 'did not'],
    cant: ["can't", 'cannot'], couldnt: ["couldn't", 'could not'], wont: ["won't", 'will not'], wouldnt: ["wouldn't", 'would not'],
    shouldnt: ["shouldn't", 'should not'], mustnt: ["mustn't", 'must not'], neednt: ["needn't", 'need not'],
    isnt: ["isn't", 'is not'], arent: ["aren't", 'are not'], wasnt: ["wasn't", 'was not'], werent: ["weren't", 'were not'],
    hasnt: ["hasn't", 'has not'], havent: ["haven't", 'have not'], hadnt: ["hadn't", 'had not'],
    youre: ["you're", 'you are'], theyre: ["they're", 'they are'], youve: ["you've", 'you have'], weve: ["we've", 'we have'],
    theyve: ["they've", 'they have'], youll: ["you'll", 'you will'], theyll: ["they'll", 'they will'], itll: ["it'll", 'it will'],
    hes: ["he's", 'he is'], shes: ["she's", 'she is'], thats: ["that's", 'that is'], whats: ["what's", 'what is'],
    theres: ["there's", 'there is'], heres: ["here's", 'here is'], whos: ["who's", 'who is'], wheres: ["where's", 'where is']
  };
  // Words written together that belong apart
  const JOINED = {
    alot: ['a lot'], noone: ['no one'], infront: ['in front'], eachother: ['each other'], atleast: ['at least'],
    aswell: ['as well'], everytime: ['every time'], thankyou: ['thank you'], ofcourse: ['of course'], incase: ['in case'],
    inspite: ['in spite'], upto: ['up to'], alongwith: ['along with']
  };
  // Common misspellings and the right spelling ("_" is a space). Found at once, without the dictionary.
  const COMMON_TYPOS = {};
  [
    "abbout:about absense:absence accademic:academic accidently:accidentally accomodate:accommodate",
    "accomodation:accommodation accross:across acheive:achieve acheived:achieved acheivement:achievement",
    "acknowlege:acknowledge aquire:acquire adress:address adresses:addresses advertisment:advertisement",
    "agressive:aggressive allready:already alltogether:altogether allways:always amatuer:amateur anual:annual",
    "anwser:answer apparantly:apparently appearence:appearance arguement:argument assasination:assassination",
    "athiest:atheist awfull:awful basicly:basically beacuse:because becasue:because becuase:because becuse:because",
    "becomeing:becoming begining:beginning beggining:beginning beleive:believe beleived:believed belive:believe",
    "benifit:benefit betweeen:between bizzare:bizarre breif:brief buisness:business bussiness:business",
    "calender:calendar carefull:careful catagory:category cemetary:cemetery certian:certain cheif:chief",
    "childern:children chocolote:chocolate collegue:colleague comming:coming commitee:committee comittee:committee",
    "completly:completely concious:conscious consciencious:conscientious convinient:convenient copywrite:copyright",
    "curiousity:curiosity decieve:deceive definate:definite definately:definitely definatly:definitely",
    "definetly:definitely desparate:desperate diffrent:different diferent:different dilema:dilemma",
    "dissapoint:disappoint dissapointed:disappointed disapear:disappear dosent:doesn't embarass:embarrass",
    "embarassed:embarrassed enviroment:environment enviornment:environment equiped:equipped especialy:especially",
    "exagerate:exaggerate excercise:exercise exellent:excellent existance:existence experiance:experience",
    "explaination:explanation extreamly:extremely familar:familiar facinating:fascinating febuary:February",
    "finaly:finally firey:fiery flourescent:fluorescent foriegn:foreign fourty:forty freind:friend freinds:friends",
    "fullfil:fulfil,fulfill futher:further gaurd:guard goverment:government govenment:government grammer:grammar",
    "greatful:grateful gratefull:grateful guarentee:guarantee happend:happened happyness:happiness harrass:harass",
    "heigth:height hieght:height heros:heroes humerous:humorous hygene:hygiene ignorence:ignorance",
    "imediately:immediately immediatly:immediately incidently:incidentally independant:independent",
    "inteligent:intelligent intelligance:intelligence interupt:interrupt irrelevent:irrelevant jist:gist",
    "knowlege:knowledge langauge:language languge:language leasure:leisure lenght:length liason:liaison",
    "libary:library lieutenent:lieutenant lisence:licence,license maintainance:maintenance maintenence:maintenance",
    "millenium:millennium miniscule:minuscule mischevious:mischievous mispell:misspell missspell:misspell",
    "neccessary:necessary necesary:necessary neccesary:necessary negotation:negotiation neice:niece",
    "nieghbor:neighbour,neighbor noticable:noticeable occassion:occasion occassionally:occasionally",
    "occurance:occurrence occured:occurred occurence:occurrence occuring:occurring ommision:omission",
    "oppurtunity:opportunity oportunity:opportunity orignal:original outragous:outrageous parliment:parliament",
    "passtime:pastime peice:piece percieve:perceive perfomance:performance permanant:permanent",
    "persistant:persistent personel:personnel peolpe:people poeple:people posession:possession possable:possible",
    "potatos:potatoes preceed:precede prefered:preferred presance:presence priviledge:privilege probaly:probably",
    "probally:probably proffesional:professional proffesor:professor profesor:professor promiss:promise",
    "pronounciation:pronunciation propoganda:propaganda publically:publicly punctuaton:punctuation",
    "puncutation:punctuation quater:quarter questionaire:questionnaire realy:really reccomend:recommend",
    "recieve:receive recieved:received reciept:receipt recomend:recommend recomendation:recommendation",
    "refered:referred referance:reference relevent:relevant religous:religious remeber:remember",
    "repitition:repetition resistence:resistance responsability:responsibility restaraunt:restaurant rythm:rhythm",
    "sandwhich:sandwich scedule:schedule sieze:seize sentance:sentence sentense:sentence sentenses:sentences",
    "seperate:separate seperated:separated seperately:separately sergent:sergeant similiar:similar",
    "sincerly:sincerely speach:speech strenght:strength succesful:successful sucessful:successful",
    "successfull:successful sucess:success succes:success supercede:supersede suprise:surprise suprised:surprised",
    "tatoo:tattoo teh:the tendancy:tendency threshhold:threshold thier:their tomatos:tomatoes tommorow:tomorrow",
    "tommorrow:tomorrow tomorow:tomorrow tongiht:tonight tounge:tongue truely:truly tyrany:tyranny",
    "underate:underrate untill:until unusuall:unusual usualy:usually vaccum:vacuum vegtable:vegetable",
    "vehical:vehicle visable:visible wierd:weird wich:which whith:with wiht:with wihch:which writting:writing",
    "writen:written yatch:yacht yeild:yield adn:and waht:what taht:that becomming:becoming beautifull:beautiful",
    "beutiful:beautiful beatiful:beautiful freindly:friendly familly:family famliy:family frist:first",
    "studing:studying studys:studies wrok:work woudl:would coudl:could shoudl:should hte:the fo:of ot:to nad:and",
    "jsut:just knwo:know konw:know tihs:this thsi:this yuo:you ahve:have hvae:have ofthe:of_the inthe:in_the",
    "tothe:to_the"
  ].join(' ').split(/\s+/).forEach(p => {
    const i = p.indexOf(':');
    COMMON_TYPOS[p.slice(0, i)] = p.slice(i + 1).split(',').map(x => x.replace(/_/g, ' '));
  });
  // Right as they are, though the dictionaries do not have them
  const KNOWN = new Set(['ok', 'wifi', 'gcode', 'cnc', 'grbl', 'dotsense', 'vlog', 'vlogs']);
  // Always with a capital letter: days, months, languages, peoples, places, religions, some brands
  const CAPITALIZE = {};
  ('Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February April June July August September ' +
    'October November December English Bangla Bengali Arabic Hindi Urdu French German Spanish Italian Russian ' +
    'Portuguese Korean Chinese Japanese Bangladesh Bangladeshi Dhaka Chittagong Chattogram Sylhet Khulna Rajshahi ' +
    'Barishal Rangpur Mymensingh Cumilla Comilla India Indian Pakistan Pakistani Nepal America American Britain ' +
    'British England Europe European Asia Asian Africa African Australia Canada London Paris Islam Muslim Hindu ' +
    'Christian Buddhist Eid Ramadan Christmas YouTube WhatsApp Facebook LinkedIn GitHub Instagram iPhone')
    .split(' ').forEach(w => { CAPITALIZE[w.toLowerCase()] = w; });
  // Verbs: the form after he / she / it (not the ones whose past is the same: read, put, cut...)
  const VERB_3SG = {};
  ('go:goes do:does have:has like:likes want:wants need:needs know:knows think:thinks make:makes take:takes ' +
    'come:comes see:sees get:gets say:says give:gives find:finds tell:tells work:works play:plays live:lives ' +
    'love:loves eat:eats drink:drinks write:writes speak:speaks study:studies try:tries watch:watches walk:walks ' +
    'run:runs sleep:sleeps feel:feels look:looks use:uses call:calls ask:asks help:helps keep:keeps start:starts ' +
    'stop:stops open:opens close:closes buy:buys pay:pays sit:sits stand:stands teach:teaches learn:learns ' +
    'understand:understands believe:believes remember:remembers forget:forgets bring:brings wear:wears cook:cooks ' +
    'clean:cleans wash:washes drive:drives ride:rides sing:sings dance:dances swim:swims listen:listens wait:waits ' +
    'hope:hopes seem:seems become:becomes leave:leaves mean:means send:sends show:shows hear:hears begin:begins ' +
    'carry:carries fly:flies cry:cries miss:misses fix:fixes reach:reaches catch:catches push:pushes finish:finishes ' +
    'visit:visits travel:travels move:moves turn:turns change:changes follow:follows happen:happens include:includes ' +
    'contain:contains depend:depends agree:agrees enjoy:enjoys hate:hates prefer:prefers matter:matters grow:grows ' +
    'build:builds draw:draws spend:spends lose:loses win:wins meet:meets sell:sells answer:answers explain:explains ' +
    'allow:allows add:adds wish:wishes')
    .split(' ').forEach(p => { const [b, s] = p.split(':'); VERB_3SG[b] = s; });
  const VERB_BASE = Object.fromEntries(Object.entries(VERB_3SG).map(([b, s]) => [s, b]));
  // "I seen" -> "I saw" / "I have seen"
  const PARTICIPLE = {
    seen: 'saw', done: 'did', gone: 'went', been: '', taken: 'took', written: 'wrote', eaten: 'ate', given: 'gave',
    spoken: 'spoke', broken: 'broke', chosen: 'chose', driven: 'drove', forgotten: 'forgot', stolen: 'stole', begun: 'began',
    ridden: 'rode', fallen: 'fell', flown: 'flew', grown: 'grew', known: 'knew', thrown: 'threw', worn: 'wore', shown: 'showed',
    hidden: 'hid', drunk: 'drank', sung: 'sang', swum: 'swam', rung: 'rang'
  };
  const COMPARATIVES = 'better|worse|bigger|smaller|taller|shorter|longer|larger|faster|slower|higher|lower|older|younger|' +
    'easier|harder|happier|stronger|weaker|cheaper|greater|nicer|closer|richer|poorer|wider|deeper|heavier|busier|prettier|' +
    'simpler|cleaner|safer|smarter|hotter|colder|warmer|cooler|darker|brighter|louder|quieter|funnier|lazier|healthier';
  const SUPERLATIVES = COMPARATIVES.replace(/er\b/g, 'est').replace('bettest', 'best').replace('worsest', 'worst');
  const ABBREVIATIONS = /(?:^|[^A-Za-z])(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|st|no|fig|approx|pp?|jr|sr|prof|mt)\.$/i;
  // Question starts: what / where ... + is / do ...; is / do ... + you / it / the ...
  const WH = /^(what|where|when|why|who|whom|whose|which|how)$/;
  const AUX = /^(is|are|am|was|were|do|does|did|can|could|will|would|shall|should|may|might|must|have|has|had|(?:is|are|was|were|do|does|did|ca|could|wo|would|should|have|has|had|must)n['’]?t|cannot|ain['’]?t)$/;
  const PRON = /^(i|you|we|they|he|she)$/;
  const SUBJECTISH = /^(i|you|we|they|he|she|it|there|this|that|these|those|the|a|an|my|your|his|her|our|their|its|any|some|anyone|anybody|someone|somebody|everyone|everybody|anything|something|everything|all|people|no)$/;
  // opening words that take a comma after them
  const OPENERS_1 = ('However Therefore Moreover Furthermore Meanwhile Finally Unfortunately Fortunately Nevertheless Nonetheless ' +
    'Consequently Additionally Firstly Secondly Thirdly Lastly Besides Anyway Luckily Sadly Surprisingly Honestly Personally ' +
    'Obviously Hopefully Interestingly Similarly Likewise Initially Eventually Afterwards Suddenly').split(' ');
  const OPENERS_2 = ['For example', 'For instance', 'In fact', 'Of course', 'On the other hand', 'As a result', 'In conclusion',
    'In summary', 'In addition', 'In other words', 'After all', 'By the way', 'In general', 'In my opinion', 'To be honest',
    'To sum up', 'First of all', 'Last but not least', 'At the same time', 'In short'];
  const either = w => '[' + w.charAt(0).toUpperCase() + w.charAt(0).toLowerCase() + ']' + w.slice(1);

  // ------------------------------------------------------------------ Bangla
  // Common spelling mistakes and the Bangla Academy spelling (প্রমিত বানান). Also found with an
  // ending: কারনে -> কারণে.
  const BN_SPELLING = [
    ['দূর্ঘটনা', 'দুর্ঘটনা'], ['দূর্নীতি', 'দুর্নীতি'], ['দূর্বল', 'দুর্বল'], ['দূর্গা', 'দুর্গা'], ['দূর্দশা', 'দুর্দশা'], ['দূর্গম', 'দুর্গম'],
    ['দূর্ভাগ্য', 'দুর্ভাগ্য'], ['দূর্যোগ', 'দুর্যোগ'], ['পরিক্ষা', 'পরীক্ষা'], ['পরিক্ষার্থী', 'পরীক্ষার্থী'], ['নিরিক্ষা', 'নিরীক্ষা'],
    ['সমিক্ষা', 'সমীক্ষা'], ['প্রতিযোগীতা', 'প্রতিযোগিতা'], ['সহযোগীতা', 'সহযোগিতা'], ['প্রতিদ্বন্দী', 'প্রতিদ্বন্দ্বী'],
    ['প্রতিদ্বন্দীতা', 'প্রতিদ্বন্দ্বিতা'], ['মুহুর্ত', 'মুহূর্ত'], ['মূহুর্ত', 'মুহূর্ত'], ['মূহূর্ত', 'মুহূর্ত'], ['উজ্জল', 'উজ্জ্বল'],
    ['ব্যাথা', 'ব্যথা'], ['শারিরীক', 'শারীরিক'], ['শারিরিক', 'শারীরিক'], ['মুখস্ত', 'মুখস্থ'], ['স্বাক্ষী', 'সাক্ষী'],
    ['অত্যাধিক', 'অত্যধিক'], ['ইদানিং', 'ইদানীং'], ['দারিদ্রতা', 'দারিদ্র্য'], ['স্বরস্বতী', 'সরস্বতী'], ['আকাংখা', 'আকাঙ্ক্ষা'],
    ['আকাঙ্খা', 'আকাঙ্ক্ষা'], ['সমীচিন', 'সমীচীন'], ['পুরষ্কার', 'পুরস্কার'], ['নমষ্কার', 'নমস্কার'], ['তিরষ্কার', 'তিরস্কার'],
    ['আবিস্কার', 'আবিষ্কার'], ['পরিস্কার', 'পরিষ্কার'], ['বহিস্কার', 'বহিষ্কার'], ['শ্রেনী', 'শ্রেণি', 'শ্রেণী'], ['প্রানী', 'প্রাণী'],
    ['কারন', 'কারণ'], ['বর্ননা', 'বর্ণনা'], ['ধারনা', 'ধারণা'], ['গননা', 'গণনা'], ['ব্যাকরন', 'ব্যাকরণ'], ['সাধারন', 'সাধারণ'],
    ['উদাহরন', 'উদাহরণ'], ['গ্রহন', 'গ্রহণ'], ['পরিমান', 'পরিমাণ'], ['প্রমান', 'প্রমাণ'], ['কল্যান', 'কল্যাণ'], ['নির্মান', 'নির্মাণ'],
    ['স্মরন', 'স্মরণ'], ['পূরন', 'পূরণ'], ['অনুসরন', 'অনুসরণ'], ['আচরন', 'আচরণ'], ['সংরক্ষন', 'সংরক্ষণ'], ['প্রশিক্ষন', 'প্রশিক্ষণ'],
    ['বিশ্লেষন', 'বিশ্লেষণ'], ['ভাষন', 'ভাষণ'], ['উপকরন', 'উপকরণ'], ['আকর্ষন', 'আকর্ষণ'], ['গবেষনা', 'গবেষণা'], ['ঘোষনা', 'ঘোষণা'],
    ['প্রেরন', 'প্রেরণ'], ['আর্শীবাদ', 'আশীর্বাদ'], ['আশির্বাদ', 'আশীর্বাদ'], ['অন্তর্ভূক্ত', 'অন্তর্ভুক্ত'], ['ভূল', 'ভুল'],
    ['অধ্যায়ন', 'অধ্যয়ন'], ['উপরোক্ত', 'উপর্যুক্ত', 'উপরিউক্ত'], ['সুষ্ঠ', 'সুষ্ঠু'], ['নিরব', 'নীরব'], ['নিরবতা', 'নীরবতা'],
    ['মনিষী', 'মনীষী'], ['বিভিষিকা', 'বিভীষিকা'], ['ভৌগলিক', 'ভৌগোলিক'], ['পৌরানিক', 'পৌরাণিক'], ['মুমূর্ষ', 'মুমূর্ষু'],
    ['সর্বোতভাবে', 'সর্বতোভাবে'], ['পিপিলিকা', 'পিপীলিকা'], ['শান্তনা', 'সান্ত্বনা'], ['সান্তনা', 'সান্ত্বনা'], ['উচিৎ', 'উচিত'],
    ['স্বত্ত্ব', 'স্বত্ব'], ['জ্ঞাণ', 'জ্ঞান'], ['গ্রামীন', 'গ্রামীণ'], ['আইনজীবি', 'আইনজীবী'], ['কর্মজীবি', 'কর্মজীবী'],
    ['বুদ্ধিজীবি', 'বুদ্ধিজীবী'], ['শ্রমজীবি', 'শ্রমজীবী'],
    // -ী to -ি in words that are not Sanskrit (Bangla Academy)
    ['সরকারী', 'সরকারি'], ['বাড়ী', 'বাড়ি'], ['গাড়ী', 'গাড়ি'], ['শাড়ী', 'শাড়ি'], ['দেশী', 'দেশি'], ['বিদেশী', 'বিদেশি'],
    ['দরকারী', 'দরকারি'], ['তরকারী', 'তরকারি'], ['ইংরেজী', 'ইংরেজি'], ['আরবী', 'আরবি'], ['ফারসী', 'ফারসি'], ['হিন্দী', 'হিন্দি'],
    ['জাপানী', 'জাপানি'], ['বাংলাদেশী', 'বাংলাদেশি'], ['পাকিস্তানী', 'পাকিস্তানি'], ['আমদানী', 'আমদানি'], ['রপ্তানী', 'রপ্তানি'],
    ['কাহিনী', 'কাহিনি'], ['গরীব', 'গরিব'], ['কুমীর', 'কুমির'], ['পাখী', 'পাখি'], ['চাবী', 'চাবি'], ['দাবী', 'দাবি'], ['হাতী', 'হাতি'],
    ['বাঙালী', 'বাঙালি'],
    // English words in Bangla: স্ট, not ষ্ট; স, not শ
    ['ষ্টেশন', 'স্টেশন'], ['মাষ্টার', 'মাস্টার'], ['পোষ্ট', 'পোস্ট'], ['রেজিষ্টার', 'রেজিস্টার'], ['ক্লাশ', 'ক্লাস']
  ].map(row => row.map(w => w.normalize('NFC')));
  const BN_WRONG = new Map(BN_SPELLING.map(([wrong, ...right]) => [wrong, right]));
  // endings a word can carry (কারন + ে = কারনে)
  const BN_ENDINGS = ['', 'ের', 'র', 'এর', 'কে', 'তে', 'য়', 'ে', 'টি', 'টা', 'টির', 'টার', 'টিকে', 'গুলো', 'গুলি', 'গুলোর', 'গুলোকে',
    'রা', 'দের', 'ই', 'ও', 'েই', 'েও', 'তেই', 'তেও', 'কেই', 'রাই', 'দেরকে', 'য়ে'].map(e => e.normalize('NFC'));
  // repeated only by mistake (many Bangla words are repeated on purpose: ধীরে ধীরে)
  const BN_REPEAT = ['এবং', 'কিন্তু', 'অথবা', 'আমি', 'আমরা', 'তুমি', 'তোমরা', 'আপনি', 'তিনি'];
  // question words: the sentence ends with ? (কি না = whether: not a question)
  const BN_QUESTION = new Set(['কি', 'কী', 'কেন', 'কোথায়', 'কখন', 'কে', 'কেমন', 'কত', 'কীভাবে', 'কিভাবে', 'কবে', 'কোথা',
    'কাকে', 'কার', 'কিসের', 'কীসের', 'কোনটি', 'কোনটা', 'কারা', 'কাদের', 'কোথাকার', 'কিসে', 'কীসে'].map(w => w.normalize('NFC')));

  const BN = '\\u0980-\\u09FF';
  const BN_CHAR = /[\u0980-\u09FF]/;
  const PAGE_MARK = /\[\[[^\S\r\n\f]*(?:new[^\S\r\n\f]*)?page(?:[^\S\r\n\f]*\d+)?[^\S\r\n\f]*\]\]/gi;
  const LINKISH = /\S*(?:@|:\/\/|www\.)\S*/gi;   // e-mail addresses and links are left alone

  // Page breaks become line breaks (a new page starts a new sentence) and links and e-mail addresses
  // a sign no rule looks at - the same length, so places stay.
  function mask(text) {
    return text.replace(PAGE_MARK, x => '\n'.repeat(x.length)).replace(LINKISH, x => '\uE000'.repeat(x.length));
  }

  // Same capitals as the word it replaces: Dont -> Don't, DONT -> DON'T (but "I" stays)
  function likeCase(found, s) {
    if (found.length > 1 && found === found.toUpperCase() && /[A-Z]/.test(found)) return s.toUpperCase();
    if (/^[A-Z]/.test(found)) return s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const subj = s => (s === 'i' ? 'I' : s);

  // an before a vowel sound: an apple, an hour, a university, a one-way street
  function wantsAn(word) {
    const l = word.toLowerCase();
    if (/^(hour|honest|honor|honour|heir)/.test(l)) return true;
    if (/^(uni|use|usu|uti|ure|uro|ubiq|eu|ewe|one\b|once|onetime)/.test(l) || l === 'one' || l === 'u') return false;
    return /^[aeiou]/.test(l);
  }

  // How far apart two words are (letters added, left out, changed or swapped), for ordering suggestions
  function editDistance(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }
  // The dictionary's suggestions, closest first (a name comes after a word unless only the capital differs)
  function rankSuggestions(word, list) {
    const low = word.toLowerCase();
    return list.map((s, i) => {
      const sl = s.toLowerCase();
      let d = editDistance(low, sl);
      if (sl.charAt(0) !== low.charAt(0)) d += 0.5;
      if (/[A-Z]/.test(s) && !/[A-Z]/.test(word) && sl !== low) d += 0.3;
      return { s, i, d };
    }).sort((a, b) => a.d - b.d || a.i - b.i).map(x => x.s);
  }

  // Sentence starts: text start, after . ! ? (and closing quotes/brackets) and a space, after a blank line.
  function sentenceStarts(m) {
    const out = new Set();
    const first = m.search(/\S/);
    if (first >= 0) out.add(first);
    const re = /([.!?])["'”’)\]]*\s+(?=\S)|\n[^\S\n]*\n\s*(?=\S)/g;
    let x;
    while ((x = re.exec(m))) {
      const at = x.index + x[0].length;
      if (x[1] === '.' && m.charAt(x.index - 1) === '.') continue;   // after ... the sentence may go on
      if (x[1] === '.' && ABBREVIATIONS.test(m.slice(Math.max(0, x.index - 12), x.index + 1))) continue;
      out.add(at);
    }
    return out;
  }

  // Sentences for the end marks: split after . ! ? । (and closing quotes), at blank lines, and where
  // a line ends and the next starts like a new sentence (a capital, a number, a list sign, or Bangla
  // after English). Each: { start, end (after its last sign), text, mark: its end marks or '' }.
  function sentenceSpans(m) {
    const spans = [];
    const cut = /[.!?।]+["'”’)\]]*(?=\s|$|[\u0980-\u09FF])|\n[^\S\n]*\n|\n(?=[^\S\n]*[A-Z0-9•*-])|(?<![\u0980-\u09FF][^\S\n]*)\n(?=[^\S\n]*[\u0980-\u09FF])/g;
    let from = 0, x;
    const push = (s, e) => {
      const raw = m.slice(s, e);
      const lead = raw.search(/\S/);
      if (lead < 0) return;
      const text = raw.slice(lead).replace(/\s+$/, '');
      const start = s + lead;
      const mk = /([.!?।]+)["'”’)\]]*$/.exec(text);
      spans.push({ start, end: start + text.length, text, mark: mk ? mk[1] : '', markAt: mk ? start + mk.index : -1 });
    };
    while ((x = cut.exec(m))) {
      if (/^[.]/.test(x[0]) && !/^\.\.\./.test(x[0]) && ABBREVIATIONS.test(m.slice(Math.max(0, x.index - 12), x.index + 1))) continue;
      const end = /^\n/.test(x[0]) ? x.index : x.index + x[0].length;
      push(from, end);
      from = x.index + x[0].length;
    }
    push(from, m.length);
    return spans;
  }

  // Is this English sentence a question? (What is..., Do you..., Is it..., ..., isn't it)
  function isQuestion(sentence) {
    const words = sentence.replace(/^[\s"'“‘(\[]+/, '').split(/\s+/).map(w => w.replace(/[^A-Za-z'’]/g, '')).filter(Boolean);
    if (words.length < 2) return false;
    const w0 = words[0].toLowerCase(), w1 = words[1].toLowerCase();
    const auxSoon = (from, to) => words.slice(from, to).some(w => AUX.test(w.toLowerCase()));
    if (WH.test(w0)) {
      if (AUX.test(w1)) return true;                                                      // What is, Where do
      if (w0 === 'how' && /^(much|many|long|old|far|often|big|tall)$/.test(w1)) return words.length === 2 || auxSoon(2, 5);
      if (w0 === 'how' && /^(come|about)$/.test(w1)) return true;
      if (/^(what|which|whose)$/.test(w0) && !/^(a|an)$/.test(w1)) return auxSoon(2, 4) && !PRON.test(w1);   // What time is it
      return false;
    }
    if (AUX.test(w0)) {
      if (/^(do|have)$/.test(w0)) return PRON.test(w1);                                     // Do it now. Have a nice day.
      if (w0 === 'may') return /^(i|we)$/.test(w1);                                           // May you live long.
      if (/^(should|had|were)$/.test(w0) && sentence.includes(',')) return false;             // Should you need help, call.
      return SUBJECTISH.test(w1) || /^[A-Z][a-z]+$/.test(words[1]);                           // Is Rina here
    }
    // tag questions: ..., isn't it / ..., right
    return /,\s*(?:(?:is|are|was|were|do|does|did|will|would|can|could|have|has|had|should|shall)(?:n['’]?t)?|won['’]?t|can['’]?t|ain['’]?t)\s+(?:it|you|he|she|they|we|there|i)\s*[.!]?$/i.test(sentence) ||
      /,\s*right\s*[.!]?$/i.test(sentence);
  }
  // A Bangla question: it has a question word (তুমি কেমন আছ)
  function isBnQuestion(sentence) {
    const words = sentence.normalize('NFC').split(/[\s,;:"“”'‘’()!?।.]+/).filter(Boolean);
    if (words.length < 3) return false;
    return words.some((w, i) => BN_QUESTION.has(w) && !(w === 'কি' && words[i + 1] === 'না'));
  }

  // English words for the dictionary: the words of the text that are checked for spelling.
  function englishWords(text) {
    const m = mask(text);
    const starts = sentenceStarts(m);
    const out = new Set();
    for (const w of spellCandidates(m, starts)) {
      const low = w.word.toLowerCase();
      if (COMMON_TYPOS[low] || KNOWN.has(low) || CAPITALIZE[low]) continue;   // known here already
      out.add(w.word);
    }
    return [...out];
  }
  function spellCandidates(m, starts) {
    const out = [];
    const re = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
    let x;
    while ((x = re.exec(m))) {
      const word = x[0], at = x.index, end = at + word.length;
      if (word.length < 2) continue;
      if (/[\d_]/.test(m.charAt(at - 1)) || /[\d_]/.test(m.charAt(end))) continue;   // A1, 3rd
      if (word === word.toUpperCase()) continue;                                       // NASA
      if (/[A-Z]/.test(word.slice(1))) continue;                                       // iPhone, McDonald
      if (/^[A-Z]/.test(word) && !starts.has(at)) continue;                             // names: Rina
      const low = word.toLowerCase();
      if (CONTRACTIONS[low] || JOINED[low]) continue;                                   // own rules
      out.push({ word, at, end });
    }
    return out;
  }

  // ------------------------------------------------------------------ the checks
  // opts: { spell: Map(word -> null (right) | [suggestions]), ignore: Set(keys), myWords: Set(lower case) }
  function findIssues(text, opts) {
    opts = opts || {};
    const spell = opts.spell || new Map(), ignore = opts.ignore || new Set(), myWords = opts.myWords || new Set();
    const m = mask(String(text || ''));
    const found = [];
    const add = (start, end, kind, why, options, rank, sure) => {
      const f = String(text).slice(start, end);
      const key = kind + ':' + (f || m.slice(Math.max(0, start - 12), start)).toLowerCase();
      if (ignore.has(key) || (!options.length && kind !== 'spelling')) return;
      found.push({ start, end, found: f, kind, why, options, rank, sure: sure === undefined ? kind !== 'spelling' : !!sure, key });
    };
    const each = (re, fn) => { re.lastIndex = 0; let x; while ((x = re.exec(m))) fn(x); };
    const starts = sentenceStarts(m);
    const grammar = (at, len, why, options) => add(at, at + len, 'grammar', why, options, 1);
    const agreeWhy = 'Subject and verb do not agree';

    // -- English: missing apostrophes, words written together
    each(/\b[A-Za-z]+\b/g, x => {
      const w = x[0], low = w.toLowerCase();
      if (/['’]/.test(m.charAt(x.index + w.length))) return;   // don't, it’s
      if (CONTRACTIONS[low]) {
        const opts2 = CONTRACTIONS[low].map(s => (low === 'im' || low === 'ive' ? s : likeCase(w, s)));
        grammar(x.index, w.length, 'Missing apostrophe', opts2.map(s => (starts.has(x.index) ? cap(s) : s)));
      } else if (JOINED[low]) {
        grammar(x.index, w.length, 'Two words', JOINED[low].map(s => likeCase(w, s)));
      }
    });
    // i -> I (also i'm, i've, i'll, i'd)
    each(/(?<![\w'’.@/-])i(['’](?:m|ve|ll|d))?(?![\w'’@/-])(?!\.\w)/g, x => {
      add(x.index, x.index + x[0].length, 'capital', '“I” is always a capital letter', ['I' + (x[1] || '')], 2);
    });
    each(/\b(could|should|would|must|might)(\s+)of\b/gi, x => grammar(x.index, x[0].length, '“have”, not “of”', [x[1] + x[2] + likeCase(x[0].slice(-2), 'have')]));
    each(/\b(more|less|better|worse|rather|other|greater|smaller|bigger|larger|higher|lower|older|younger|faster|slower|stronger|weaker|longer|shorter)(\s+)then\b/gi, x => {
      grammar(x.index + x[1].length + x[2].length, 4, '“than” after a comparison', [likeCase(x[0].slice(-4), 'than')]);
    });

    // -- sentences: subject and verb
    const agree = (re, fix) => each(re, x => grammar(x.index, x[0].length, agreeWhy, [fix(x)]));
    agree(/\bi(\s+)(is|are)\b/g, x => 'I' + x[1] + 'am');
    agree(/\b(he|she|it)(\s+)are\b/gi, x => x[1] + x[2] + 'is');
    agree(/\b(we|you|they)(\s+)is\b/gi, x => x[1] + x[2] + 'are');
    agree(/\b(we|you|they)(\s+)was\b/gi, x => x[1] + x[2] + 'were');
    agree(/\b(he|she|it)(\s+)(?:don't|don’t|dont)\b/gi, x => x[1] + x[2] + "doesn't");
    agree(/\b(i|you|we|they)(\s+)(?:doesn't|doesn’t|doesnt)\b/gi, x => subj(x[1]) + x[2] + "don't");
    // "used to": he use to -> he used to
    each(/\b(I|you|we|they|he|she|it)(\s+)(use)(\s+)to\b/gi, x => grammar(x.index, x[0].length - 2 - x[4].length, '“used to” for the past', [subj(x[1]) + x[2] + 'used']));
    // he go -> he goes (not after does / can / let ... he, and "it" only as the subject)
    const helper = '(?:do|does|did|don[\'’]?t|doesn[\'’]?t|didn[\'’]?t|can|could|will|would|shall|should|may|might|must|can[\'’]?t|cannot|' +
      'couldn[\'’]?t|won[\'’]?t|wouldn[\'’]?t|shouldn[\'’]?t|mustn[\'’]?t|let|lets|letting|make|makes|made|making|help|helps|helped|helping|' +
      'see|sees|saw|seeing|watch|watches|watched|watching|hear|hears|heard|hearing|feel|feels|felt|feeling|have|has|had|to|why)';
    const verbs = Object.keys(VERB_3SG).join('|');
    each(new RegExp('(?<!\\b' + helper + '\\s+)\\b(he|she|it)(\\s+)(' + verbs + ')\\b(?![\'’-])', 'gi'), x => {
      const v = x[3].toLowerCase();
      if (x[3] !== v && x[3] !== x[3].toUpperCase()) return;                                  // (a name: He Will)
      if (v === 'use' && /^\s+to\b/.test(m.slice(x.index + x[0].length))) return;   // (used to)
      const before = m.slice(Math.max(0, x.index - 30), x.index);
      if (/\b(?:I|you|he|she|we|they|it|me|him|her|us|them)\s+(?:and|or|nor)\s+$/i.test(before)) return;   // he and she go
      if (/^it$/i.test(x[1])) {
        const subject = starts.has(x.index) || /(?:[,;:(]|\b(?:and|but|so|because|if|when|while|although|though|since|that|as|until|unless|or|whether|once|before|after|then|think|thinks|thought|know|knows|knew|hope|hopes|believe|believes|guess|suppose|say|says|said|sure|mean|means))\s*$/i.test(before);
        if (!subject) return;
      }
      grammar(x.index, x[0].length, agreeWhy, [x[1] + x[2] + likeCase(x[3], VERB_3SG[v])]);
    });
    // they goes -> they go, I has -> I have
    each(new RegExp('(?<!\\bthank\\s+)\\b(I|you|we|they)(\\s+)(' + Object.keys(VERB_BASE).join('|') + ')\\b(?![\'’-])', 'gi'), x => {
      const v = x[3].toLowerCase();
      if (x[3] !== v && x[3] !== x[3].toUpperCase()) return;
      grammar(x.index, x[0].length, agreeWhy, [subj(x[1]) + x[2] + likeCase(x[3], VERB_BASE[v])]);
    });
    // there is many -> there are many
    each(/\b(there)(?:(\s+)(is|was)|(['’]s))(?=\s+(?:many|several|few|two|three|four|five|six|seven|eight|nine|ten|lots|numerous|various|both|dozens|hundreds|thousands|millions)\b)/gi, x => {
      grammar(x.index, x[0].length, agreeWhy, [x[1] + ' ' + (x[3] && x[3].toLowerCase() === 'was' ? 'were' : 'are')]);
    });
    // this are -> these are / this is
    each(/\b(this|these|those|that)(\s+)(are|were|is|was)\b/gi, x => {
      const w = x[1].toLowerCase(), v = x[3].toLowerCase(), past = /^(was|were)$/.test(v), plural = /^(are|were)$/.test(v);
      if (w === 'that' && !starts.has(x.index)) return;   // the books that are
      const near = w === 'this' || w === 'these';
      const one = (near ? 'this ' : 'that ') + (past ? 'was' : 'is'), many = (near ? 'these ' : 'those ') + (past ? 'were' : 'are');
      if ((w === 'this' || w === 'that') && plural) grammar(x.index, x[0].length, agreeWhy, [likeCase(x[1], many), likeCase(x[1], one)]);
      if ((w === 'these' || w === 'those') && !plural) grammar(x.index, x[0].length, agreeWhy, [likeCase(x[1], many), likeCase(x[1], one)]);
    });
    // more taller -> taller, most tallest -> tallest
    each(new RegExp('\\b(more)(\\s+)(' + COMPARATIVES + ')\\b', 'gi'), x => grammar(x.index, x[0].length, '“-er” already means “more”', [likeCase(x[1], x[3])]));
    each(new RegExp('\\b(most)(\\s+)(' + SUPERLATIVES + ')\\b', 'gi'), x => grammar(x.index, x[0].length, '“-est” already means “most”', [likeCase(x[1], x[3])]));
    // I seen -> I saw / I have seen (not in "have you seen", "are you done")
    each(new RegExp('(?<!\\b(?:am|is|are|was|were|be|been|being|have|has|had|having|get|gets|got|getting|haven[\'’]?t|hasn[\'’]?t|hadn[\'’]?t|aren[\'’]?t|isn[\'’]?t|wasn[\'’]?t|weren[\'’]?t)\\s+)\\b(I|you|we|they|he|she)(\\s+)(' + Object.keys(PARTICIPLE).join('|') + ')\\b', 'gi'), x => {
      const s = subj(x[1]), p = x[3].toLowerCase(), l = s.toLowerCase();
      if (x[3] !== p) return;
      const past = p === 'been' ? (/^(i|he|she)$/.test(l) ? 'was' : 'were') : PARTICIPLE[p];
      grammar(x.index, x[0].length, 'Past tense, or “have” with this form', [s + x[2] + past, s + x[2] + (/^(he|she)$/.test(l) ? 'has ' : 'have ') + p]);
    });
    // its / it's
    each(/\b(its)(?=\s+(?:a|an|the|not|been|going|getting|raining|snowing|ok|okay|alright|already|also|just|always|never|still|so|too|really|quite|me|you|him|us|them|my|your|his|her|our|their|this|that|here|there|(?:time|about)\s+to|all\s+right)\b)/gi, x => {
      grammar(x.index, 3, '“it’s” means “it is”', [likeCase(x[1], "it's")]);
    });
    each(/\b(it['’]s)(?=\s+(?:own|tail|name|color|colour|size|shape|owner|eyes|head|body|legs|wings|nest|leaves|roots|purpose|value|price|meaning|members|users|capital|population|history|website)\b)/gi, x => {
      grammar(x.index, x[1].length, '“its” = belonging to it', [likeCase(x[1], 'its')]);
    });
    // your / you're
    each(/\b(your)(?=\s+(?:welcome(?=\s*(?:[.!,?]|$|to\b|here\b|back\b|anytime\b))|not|going|a|an|the|so|too|always|never|really|just|sure|coming|kidding|joking|getting|making|trying|looking|talking|(?:right|wrong)\s+about)\b)/gi, x => {
      grammar(x.index, 4, '“you’re” means “you are”', [likeCase(x[1], "you're")]);
    });
    // there / their / they're
    each(/\b(there)(?=\s+(?:going|coming|doing|trying|getting|playing|working|looking|talking|leaving|saying|making|taking|eating|studying|waiting|running|sleeping|living|using|reading|writing|sitting|standing|walking|watching|buying|asking|telling|thinking|laughing|crying|fighting|singing|dancing|swimming|staying|moving|starting|finishing|driving|flying|learning|teaching|helping|losing|winning|hoping|planning|wearing)\b)/gi, x => {
      grammar(x.index, 5, '“they’re” means “they are”', [likeCase(x[1], "they're")]);
    });
    each(/\b(their)(?=\s+(?:going|trying)\s+to\b)/gi, x => grammar(x.index, 5, '“they’re” means “they are”', [likeCase(x[1], "they're")]));
    each(/\b(they['’]re)(?=\s+(?:own|car|house|name|dog|cat|phone|room|teacher|mother|father|son|daughter|boss|job|homework|life)\b)/gi, x => {
      grammar(x.index, x[1].length, '“their” = belonging to them', [likeCase(x[1], 'their')]);
    });
    // too / to
    each(/\b(?:is|are|was|were|be|been|am|it['’]s|he['’]s|she['’]s|that['’]s|['’]re|['’]m|much|far|way)(\s+)(to)(?=\s+(?:late|early|big|small|hot|cold|expensive|cheap|difficult|hard|easy|tired|young|old|loud|much|many|heavy|good|bad|soon|little|short|high)\b)/gi, x => {
      grammar(x.index + x[0].length - 2, 2, '“too” = more than enough', [likeCase(x[2], 'too')]);
    });
    each(/\b(me)(\s+)(to)(?=\s*(?:[.!?]|\n|$))/gi, x => grammar(x.index + x[1].length + x[2].length, 2, '“too” = also', [likeCase(x[3], 'too')]));
    // double negatives: don't know nothing -> anything
    each(/\b(?:(?:do|does|did|ca|wo|is|are|was|were|have|has|had|could|should|would|must)n['’]?t|not|never|cannot)((?:\s+[A-Za-z]+){0,2}?\s+)(nothing|nobody|nowhere)\b/gi, x => {
      const w = x[2], s = x.index + x[0].length - w.length;
      grammar(s, w.length, 'Two “no” words: one is enough', [likeCase(w, { nothing: 'anything', nobody: 'anybody', nowhere: 'anywhere' }[w.toLowerCase()])]);
    });
    // a / an
    each(/\b(a|an|A|An|AN)(\s+)([A-Za-z]+)/g, x => {
      const word = x[3];
      if (x[1] === 'A' && !starts.has(x.index)) return;               // Plan A is ...
      if (word.length > 1 && word === word.toUpperCase()) return;   // an FBI agent
      if (/^[A-Za-z]$/.test(word)) return;                            // a b c
      const an = wantsAn(word), isAn = x[1].toLowerCase() === 'an';
      if (an === isAn) return;
      grammar(x.index, x[1].length, an ? '“an” before a vowel sound' : '“a” before a consonant sound', [likeCase(x[1], an ? 'an' : 'a')]);
    });
    // the same word twice
    each(/\b([A-Za-z]+)(\s+)\1\b/gi, x => {
      if (/^(had|that)$/i.test(x[1])) return;
      grammar(x.index, x[0].length, 'The same word twice', [x[1]]);
    });
    // at the start of a sentence: Me and him -> He and I; capital letters; a comma after an opening word
    const opener1 = new RegExp('^(' + OPENERS_1.map(either).join('|') + ')(\\s+)(?=(?:I|you|we|they|he|she|it|there|this|that|these|those|the|a|an|my|our|your|his|her|their|its|[A-Z][a-z]+)\\b)');
    const opener2 = new RegExp('^(' + OPENERS_2.map(either).join('|') + ')(\\s+)(?![,.;:!?]|not\\b)');
    const opener3 = /^([Yy]es|[Nn]o|[Ww]ell|[Oo]h|[Oo]kay|OK|[Oo]k)(\s+)(?=(?:I|i|you|we|they|he|she|it|that|this|there|thank|please|sir|madam)\b)/;
    for (const at of starts) {
      const rest = m.slice(at, at + 60);
      const pair = /^([Mm]e)(\s+)and(\s+)(him|her|them)\b/.exec(rest) || /^([Hh]im|[Hh]er|[Tt]hem)(\s+)and(\s+)(me|I)\b/.exec(rest);
      if (pair) {
        const other = /^(me)$/i.test(pair[1]) ? pair[4] : pair[1];
        grammar(at, pair[0].length, '“I” and “he” for the ones doing it', [{ him: 'He', her: 'She', them: 'They' }[other.toLowerCase()] + ' and I']);
      }
      const mine = /^([Mm]e)(\s+)and(\s+)(my\s+[a-z]+)\b/.exec(rest);
      if (mine) grammar(at, mine[0].length, '“I” and “he” for the ones doing it', [cap(mine[4]) + ' and I']);
      const o = (opener1.exec(rest) || opener2.exec(rest) || opener3.exec(rest));
      if (o && !/^however\s+(?:much|many|hard|long|often|far|big|small|good|bad|well|little|few|high|low|fast|slow)\b/i.test(rest)) {
        const lower = /^[a-z]/.test(o[1]);
        add(at, at + o[1].length, 'punctuation', lower ? 'A capital letter and a comma after the opening word' : 'A comma after the opening word', [cap(o[1]) + ','], lower ? 2 : 3);
      }
      const w = /^[a-z][a-z'’]*/.exec(m.slice(at, at + 40));
      if (!w || /^i(['’]|$)/.test(w[0])) continue;   // i is its own rule
      const after = m.slice(at + w[0].length, at + w[0].length + 2);
      if (/^[A-Z]/.test(after) || /^\.[a-z]/.test(after)) continue;   // iPhone, e.g.
      add(at, at + w[0].length, 'capital', 'Capital letter at the start of a sentence', [cap(w[0])], 3);
    }
    // names, days, months, languages
    each(/\b[a-z]+\b/g, x => {
      const fix = CAPITALIZE[x[0]];
      if (fix && !/['’-]/.test(m.charAt(x.index + x[0].length)) && !/[-'’]/.test(m.charAt(x.index - 1))) {
        add(x.index, x.index + x[0].length, 'capital', 'A capital letter for names, days, months and languages', [fix], 2);
      }
    });

    // -- punctuation and spaces (English and Bangla)
    each(/(\S)( +)([,.;:!?।])(?=\s|$|["'”’)])/g, x => {
      if (x[3] === '.' && m.charAt(x.index + x[0].length) === '.') return;   // " ..."
      const s = x.index + 1;
      add(s, s + x[2].length + 1, 'punctuation', 'No space before ' + (x[3] === '।' ? 'the danda' : 'punctuation'), [x[3]], 2);
    });
    each(new RegExp('([,;])(?=[A-Za-z' + BN + '])', 'g'), x => {
      add(x.index, x.index + 1, 'punctuation', 'A space after the ' + (x[1] === ',' ? 'comma' : 'semicolon'), [x[1] + ' '], 2);
    });
    each(/([a-z])([!?])(?=[A-Za-z])|([a-z])(\.)(?=[A-Z][a-z])/g, x => {
      x[2] = x[2] || x[4];
      const s = x.index + 1;
      if (x[2] === '.' && ABBREVIATIONS.test(m.slice(Math.max(0, s - 11), s + 1))) return;
      add(s, s + 1, 'punctuation', 'A space after the end of a sentence', [x[2] + ' '], 2);
    });
    each(new RegExp('([।?!])(?=[' + BN + '])', 'g'), x => {
      if (x[1] === '।' && m.charAt(x.index + 1) === '।') return;
      add(x.index, x.index + 1, 'punctuation', 'A space after the end of a sentence', [x[1] + ' '], 2);
    });
    each(/(\S)( {2,})(?=\S)/g, x => add(x.index + 1, x.index + 1 + x[2].length, 'space', 'Two spaces', [' '], 5));
    // one mark, not two: !! ?? ,, .. and ,. .? ?.
    const NAMES = { '!': 'exclamation mark', '?': 'question mark', ',': 'comma', ';': 'semicolon', ':': 'colon' };
    each(/([!?,;:])\1+/g, x => {
      if (x[1] === ':' && /^\/\//.test(m.slice(x.index + x[0].length))) return;
      add(x.index, x.index + x[0].length, 'punctuation', 'One ' + NAMES[x[1]] + ' is enough', [x[1]], 2);
    });
    each(/(?<![.\d])\.\.(?![.\d])/g, x => add(x.index, x.index + 2, 'punctuation', 'One full stop, or three for “…”', ['.', '...'], 2));
    each(/\.{4,}/g, x => add(x.index, x.index + x[0].length, 'punctuation', 'Three dots for “…”', ['...'], 2));
    each(/[,;:][^\S\n]*([.!?।])(?![.!?।])/g, x => add(x.index, x.index + x[0].length, 'punctuation', 'Two marks together: one is enough', [x[1]], 2));
    each(/(?<!\.)\.([?!])|([?!])\.(?!\.)/g, x => add(x.index, x.index + 2, 'punctuation', 'Two marks together: one is enough', [x[1] || x[2]], 2));
    each(/\(([^\S\n]+)/g, x => add(x.index, x.index + x[0].length, 'punctuation', 'No space inside brackets', ['('], 2));
    each(/(\S)([^\S\n]+)\)/g, x => add(x.index + 1, x.index + x[0].length, 'punctuation', 'No space inside brackets', [')'], 2));
    // Bangla: । not . at the end of a sentence; one danda
    each(new RegExp('([' + BN + '])\\.(?!\\.)(?=\\s|$|["\'”’)]|([' + BN + ']))', 'g'), x => {
      add(x.index + 1, x.index + 2, 'punctuation', 'A Bangla sentence ends with । (danda)', [x[2] ? '। ' : '।'], 2);
    });
    each(/।{2,}/g, x => add(x.index, x.index + x[0].length, 'punctuation', 'One danda', ['।'], 2));
    // a question ends with ? (English and Bangla)
    for (const s of sentenceSpans(m)) {
      const bangla = BN_CHAR.test(s.text);
      if (!(bangla ? isBnQuestion(s.text) : isQuestion(s.text))) continue;
      if (s.mark === '.' || s.mark === '।') add(s.markAt, s.markAt + 1, 'punctuation', 'A question ends with a question mark', ['?'], 1);
      else if (!s.mark) add(s.end, s.end, 'punctuation', 'A question ends with a question mark', ['?'], 1);
    }
    // end of a paragraph without an end mark
    const lines = [];
    each(/[^\n]+/g, x => lines.push({ at: x.index, text: x[0] }));
    const SMALL = /^(a|an|the|and|or|of|in|on|at|to|for|with|by|from|but|nor|as|is|my)$/i;
    lines.forEach((ln, k) => {
      const body = ln.text.replace(/\s+$/, '');
      if (!body.trim()) return;
      const next = lines[k + 1];
      const gapLines = next ? m.slice(ln.at + ln.text.length, next.at).split('\n').length - 1 : 0;
      const end = ln.at + body.length, last = body.charAt(body.length - 1);
      const bangla = BN_CHAR.test(last);
      const nextStart = next ? next.text.trim().charAt(0) : '';
      // the paragraph ends: a blank line, the end, a capital letter, or English followed by Bangla
      const paragraphEnd = !next || gapLines > 1 || !nextStart || /[A-Z]/.test(nextStart) || (!bangla && BN_CHAR.test(nextStart));
      if (!paragraphEnd) return;
      if (/[.!?।:;,"'”’)\]-]$/.test(body)) return;
      const words = body.trim().split(/\s+/);
      if (bangla) {
        if (words.length < 4) return;
      } else {
        if (words.length < 4 || !/[A-Za-z0-9]/.test(last) || /^\s*(?:[-*•]|\d+[.)])/.test(body)) return;   // (lists)
        // a title: most of its words start with a capital (not counting I and small words)
        const big = words.filter(w => !SMALL.test(w) && w !== 'I' && /^[A-Za-z]/.test(w));
        if (words.length < 10 && big.length && big.filter(w => /^[A-Z]/.test(w)).length / big.length >= 0.75) return;
      }
      // What a day! How nice! (not a question): ! or .
      const lastSentence = body.split(/[.!?।]["'”’)\]]*\s+/).pop();
      const exclaim = !bangla && /^\s*(?:what\s+an?\b|how\s+(?!(?:much|many|long|old|far|often|big|tall|come|about|is|are|am|was|were|do|does|did|can|could|will|would|shall|should|may|might|must|have|has|had)\b)[a-z]+\b)/i.test(lastSentence);
      add(end, end, 'punctuation', bangla ? 'End the sentence with । (danda)' : exclaim ? 'End the sentence with ! or a full stop' : 'End the sentence with a full stop', bangla ? ['।'] : exclaim ? ['!', '.'] : ['.'], 2);
    });

    // -- Bangla words
    each(new RegExp('[' + BN + '\\u200C\\u200D]+', 'g'), x => {
      const word = x[0].normalize('NFC');
      for (let cut = word.length; cut > 0; cut--) {
        const stem = word.slice(0, cut), ending = word.slice(cut);
        const right = BN_WRONG.get(stem);
        // (দেশীয় is right: no য় ending after -ী)
        if (right && BN_ENDINGS.includes(ending) && !(ending.startsWith('য়'.normalize('NFC')) && stem.endsWith('ী'))) {
          add(x.index, x.index + x[0].length, 'spelling-bn', 'Bangla Academy spelling', right.map(r => r + ending), 1);
          break;
        }
      }
    });
    each(new RegExp('(?<![' + BN + '])(' + BN_REPEAT.join('|') + ')(\\s+)\\1(?![' + BN + '])', 'g'), x => {
      grammar(x.index, x[0].length, 'The same word twice', [x[1]]);
    });

    // -- English spelling: common misspellings at once, the rest from the dictionary
    for (const c of spellCandidates(m, starts)) {
      const low = c.word.toLowerCase();
      if (myWords.has(low) || KNOWN.has(low) || CAPITALIZE[low]) continue;
      // (at the start of a sentence the fixes start with a capital, and win over the capital rule)
      const atStart = starts.has(c.at);
      const typo = COMMON_TYPOS[low];
      if (typo) { add(c.at, c.end, 'spelling', 'Spelling', typo.map(t => (atStart ? cap : likeCase.bind(null, c.word))(t)), atStart ? 2 : 3, true); continue; }
      const s = spell.get(c.word);
      if (!Array.isArray(s)) continue;   // right, or not checked yet
      let options = rankSuggestions(c.word, s.filter(x => x !== c.word)).slice(0, 5);
      if (atStart) options = [...new Set(options.map(cap).concat(c.word === low ? [cap(c.word)] : []))].filter(o => o !== c.word);
      if (options.length && options[0].toLowerCase() === low) add(c.at, c.end, 'capital', 'A capital letter for a name', [options[0]], atStart ? 2.5 : 4, true);
      else add(c.at, c.end, 'spelling', options.length ? 'Spelling' : 'Not in the dictionary', options, atStart ? 2.5 : 4);
    }

    // one suggestion per place: the most important first, in text order
    found.sort((a, b) => a.start - b.start || a.rank - b.rank || (b.end - b.start) - (a.end - a.start));
    const clash = (a, b) => (a.start < b.end && b.start < a.end) || (a.start === a.end && b.start === b.end && a.start === b.start);
    const out = [];
    for (const f of found) {
      // kept ones do not overlap and come in order: only the last ones can clash
      if (out.slice(-3).some(o => clash(o, f))) continue;
      out.push(f);
    }
    out.forEach((f, i) => { f.id = i + 1; });
    return out;
  }

  // The text with the first suggestion of these issues applied (from the end, so places stay right).
  function applyAll(text, issues) {
    let out = String(text);
    for (const f of issues.slice().sort((a, b) => b.start - a.start)) {
      if (!f.options.length || out.slice(f.start, f.end) !== f.found) continue;
      out = out.slice(0, f.start) + f.options[0] + out.slice(f.end);
    }
    return out;
  }

  const api = {
    findIssues, englishWords, applyAll, isQuestion, isBnQuestion, rankSuggestions, sentenceSpans,
    CONTRACTIONS, JOINED, BN_SPELLING, COMMON_TYPOS, CAPITALIZE, VERB_3SG, wantsAn
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DotSenseCheck = api;
})(typeof window !== 'undefined' ? window : this);
