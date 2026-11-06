/* 요금과 예약 시기는 2026년 11월에 정리한 참고값입니다. 앱 화면에서 수정할 수 있습니다. */
const MODES = { train:'기차', bus:'버스', flight:'항공', ferry:'페리', car:'차량' };
const COUNTRIES = { FR:'프랑스', GB:'영국', IT:'이탈리아', CH:'스위스', DE:'독일', CZ:'체코', AT:'오스트리아', HU:'헝가리', ES:'스페인', PT:'포르투갈', NL:'네덜란드', BE:'벨기에', GR:'그리스', TR:'튀르키예', HR:'크로아티아', DK:'덴마크', SE:'스웨덴', NO:'노르웨이', FI:'핀란드', IS:'아이슬란드' };
const TIMEZONES = { FR:'Europe/Paris', GB:'Europe/London', IT:'Europe/Rome', CH:'Europe/Zurich', DE:'Europe/Berlin', CZ:'Europe/Prague', AT:'Europe/Vienna', HU:'Europe/Budapest', ES:'Europe/Madrid', PT:'Europe/Lisbon', NL:'Europe/Amsterdam', BE:'Europe/Brussels', GR:'Europe/Athens', TR:'Europe/Istanbul', HR:'Europe/Zagreb', DK:'Europe/Copenhagen', SE:'Europe/Stockholm', NO:'Europe/Oslo', FI:'Europe/Helsinki', IS:'Atlantic/Reykjavik' };
const SEASON_WORDS = ['', '비추천', '아쉬움', '보통', '좋음', '가장 좋음'];

/* 자주 쓰는 구간: [도시A, 도시B, 수단, 분, 편도 참고 요금(EUR)] */
const SEGMENTS = [
 ['paris','london','train',140,90],['paris','zurich','train',245,75],['paris','strasbourg','train',110,55],['paris','nice','train',340,70],['paris','amsterdam','train',200,70],['paris','brussels','train',85,50],['paris','barcelona','train',400,80],['paris','munich','train',330,80],['paris','frankfurt','train',230,70],['paris','interlaken','train',300,90],
 ['london','edinburgh','train',270,70],['london','amsterdam','train',240,90],['london','brussels','train',125,80],
 ['zurich','lucerne','train',45,28],['zurich','interlaken','train',120,60],['zurich','milan','train',200,60],['zurich','munich','train',215,60],['zurich','zermatt','train',205,110],['lucerne','interlaken','train',110,35],['interlaken','grindelwald','train',35,12],['interlaken','zermatt','train',135,70],['grindelwald','zermatt','train',170,80],['interlaken','milan','train',230,75],['zermatt','milan','train',190,70],['lucerne','milan','train',190,60],['grindelwald','lucerne','train',145,45],
 ['milan','venice','train',145,35],['milan','florence','train',115,40],['milan','rome','train',185,55],['venice','florence','train',125,35],['venice','rome','train',235,55],['florence','rome','train',95,35],['rome','naples','train',75,30],['naples','positano','ferry',110,25],['venice','vienna','train',470,60],['venice','munich','train',385,50],
 ['munich','salzburg','train',110,30],['munich','vienna','train',240,50],['munich','prague','bus',300,30],['munich','frankfurt','train',195,55],['munich','berlin','train',245,60],['frankfurt','heidelberg','train',55,20],['frankfurt','strasbourg','train',125,40],['frankfurt','amsterdam','train',240,60],['frankfurt','berlin','train',245,60],['berlin','prague','train',250,40],['berlin','amsterdam','train',375,60],
 ['prague','cesky','bus',175,14],['cesky','hallstatt','car',200,50],['cesky','salzburg','car',170,40],['prague','vienna','train',240,30],['prague','salzburg','bus',320,35],['prague','budapest','train',415,35],['vienna','budapest','train',160,25],['vienna','salzburg','train',150,35],['salzburg','hallstatt','bus',150,20],['hallstatt','vienna','train',220,45],['hallstatt','budapest','train',430,55],
 ['barcelona','madrid','train',165,50],['madrid','seville','train',160,50],['madrid','granada','train',200,45],['seville','granada','bus',190,25],['seville','lisbon','bus',420,40],['madrid','lisbon','flight',80,70],['barcelona','granada','flight',95,60],['barcelona','seville','flight',105,60],['barcelona','lisbon','flight',120,70],['rome','athens','flight',130,80],['lisbon','porto','train',170,30],['porto','madrid','flight',75,70],
 ['amsterdam','brussels','train',115,35],['amsterdam','bruges','train',205,45],['brussels','bruges','train',60,18],
 ['athens','santorini','flight',50,70],['split','dubrovnik','bus',255,25],['oslo','bergen','train',420,70],['copenhagen','stockholm','train',310,50],['copenhagen','oslo','flight',75,70],['stockholm','helsinki','flight',60,70],['helsinki','rovaniemi','train',480,60]
];

/* 철도 사업자별 표 공개 시점. 시기는 대략값이며 노선과 시즌에 따라 달라집니다. */
const RAIL_RULES = {
 FR:{op:'SNCF Connect',url:'https://www.sncf-connect.com/',best:90,note:'TGV 할인표는 일찍 소진되는 편'},
 GB:{op:'National Rail 또는 Trainline',url:'https://www.nationalrail.co.uk/',best:60,note:'좌석 할인표는 보통 약 12주 전부터 공개'},
 IT:{op:'Trenitalia 또는 Italo',url:'https://www.trenitalia.com/',best:60,note:'Super Economy는 일찍 살수록 유리'},
 CH:{op:'SBB',url:'https://www.sbb.ch/',best:14,note:'패스가 있으면 좌석 예약이 필요 없는 구간이 많음'},
 DE:{op:'Deutsche Bahn',url:'https://www.bahn.de/',best:60,note:'Sparpreis는 수요에 따라 변동'},
 CZ:{op:'České dráhy 또는 RegioJet',url:'https://www.cd.cz/',best:30,note:'좌석 지정 표를 함께 확인'},
 AT:{op:'ÖBB',url:'https://www.oebb.at/',best:45,note:'Sparschiene은 일찍 살수록 유리'},
 HU:{op:'MÁV',url:'https://www.mavcsoport.hu/',best:30,note:'국제선은 ÖBB에서도 구매 가능'},
 ES:{op:'Renfe',url:'https://www.renfe.com/',best:60,note:'표 공개 시점이 시즌마다 달라 공지 확인 필요'},
 PT:{op:'CP',url:'https://www.cp.pt/',best:30,note:'Alfa Pendular는 사전 할인 있음'},
 NL:{op:'NS International',url:'https://www.nsinternational.com/',best:45,note:'국제선은 Eurostar 포함 여부 확인'},
 BE:{op:'SNCB 또는 Eurostar',url:'https://www.belgiantrain.be/',best:30,note:'국내선은 당일 구매도 쉬운 편'},
 NO:{op:'Vy',url:'https://www.vy.no/',best:60,note:'베르겐선 Minipris는 일찍 소진'},
 SE:{op:'SJ',url:'https://www.sj.se/',best:45,note:'국제 구간은 좌석 확인 필요'},
 FI:{op:'VR',url:'https://www.vr.fi/',best:45,note:'라플란드 야간열차는 겨울에 일찍 마감'},
 _:{op:'Rome2Rio로 경로 확인',url:'https://www.rome2rio.com/',best:30,note:'운영사 공식 사이트에서 다시 확인'}
};
const LEG_OVERRIDES = {
 'paris|london':{op:'Eurostar',url:'https://www.eurostar.com/',best:120,note:'출국 심사 시간을 포함해 탑승 전 여유 필요'},
 'london|brussels':{op:'Eurostar',url:'https://www.eurostar.com/',best:120,note:'출국 심사 시간을 포함해 탑승 전 여유 필요'},
 'london|amsterdam':{op:'Eurostar',url:'https://www.eurostar.com/',best:120,note:'좌석 수가 적어 일찍 마감되는 편'},
 'zurich|milan':{op:'SBB 또는 Trenitalia',url:'https://www.sbb.ch/',best:45,note:'EuroCity 좌석 예약 필수'},
 'interlaken|milan':{op:'SBB 또는 Trenitalia',url:'https://www.sbb.ch/',best:45,note:'브리그 환승 구간 좌석 확인'}
};

/* 도시 교통권 참고값: 단일권, 1일권. 화면에서 바꿀 수 있고 변경값은 브라우저에 저장됩니다. */
const CITY_PASSES = {
 paris:{cur:'EUR',single:2.55,day:12,name:'Navigo Easy와 1일권'},london:{cur:'GBP',single:2.9,day:8.9,name:'Oyster 또는 비접촉 카드 상한'},rome:{cur:'EUR',single:1.5,day:7,name:'BIT와 Roma 24H'},florence:{cur:'EUR',single:1.7,day:6,name:'Autolinee Toscane'},venice:{cur:'EUR',single:9.5,day:25,name:'ACTV 수상버스'},milan:{cur:'EUR',single:2.2,day:7.6,name:'ATM'},
 zurich:{cur:'CHF',single:2.8,day:9.2,name:'ZVV 시내 구역'},munich:{cur:'EUR',single:4.1,day:9.7,name:'MVV'},berlin:{cur:'EUR',single:3.8,day:11,name:'BVG AB 구역'},prague:{cur:'CZK',single:42,day:150,name:'PID'},vienna:{cur:'EUR',single:3.2,day:9.3,name:'Wiener Linien'},budapest:{cur:'HUF',single:450,day:2500,name:'BKK'},
 barcelona:{cur:'EUR',single:2.9,day:11.2,name:'TMB'},madrid:{cur:'EUR',single:1.7,day:8.4,name:'Metro Madrid'},lisbon:{cur:'EUR',single:1.85,day:7.25,name:'Carris와 Metro'},porto:{cur:'EUR',single:1.6,day:7.5,name:'Andante'},amsterdam:{cur:'EUR',single:3.4,day:9.5,name:'GVB'},athens:{cur:'EUR',single:1.2,day:4.1,name:'OASA'},istanbul:{cur:'TRY',single:35,day:130,name:'Istanbulkart'}
};
const DEFAULT_RATES = { KRW:1, EUR:1620, GBP:1880, CHF:1730, USD:1420, CZK:66, HUF:4.2, TRY:36, DKK:217, SEK:150, NOK:140 };

/* 패스 가격: 2026년 11월 공식 페이지 표시가. 구매 전 재확인 필요 */
const RAIL_PASSES = [
 {id:'eu4',  name:'Eurail Global Flexi 4일(1개월)', days:4,  cur:'USD', price:225, scope:'all', source:'https://eurail.com/en/eurail-passes/global-pass'},
 {id:'eu5',  name:'Eurail Global Flexi 5일(1개월)', days:5,  cur:'USD', price:253, scope:'all', source:'https://eurail.com/en/eurail-passes/global-pass'},
 {id:'eu7',  name:'Eurail Global Flexi 7일(1개월)', days:7,  cur:'USD', price:303, scope:'all', source:'https://eurail.com/en/eurail-passes/global-pass'},
 {id:'eu10', name:'Eurail Global Flexi 10일(2개월)',days:10, cur:'USD', price:355, scope:'all', source:'https://eurail.com/en/eurail-passes/global-pass'},
 {id:'eu15', name:'Eurail Global Flexi 15일(2개월)',days:15, cur:'USD', price:440, scope:'all', source:'https://eurail.com/en/eurail-passes/global-pass'},
 {id:'ch3',  name:'Swiss Travel Pass Flex 3일',     days:3,  cur:'CHF', price:289, scope:'CH',  source:'https://www.swiss-pass.ch/swiss-travel-pass-flex/'},
 {id:'ch4',  name:'Swiss Travel Pass Flex 4일',     days:4,  cur:'CHF', price:349, scope:'CH',  source:'https://www.swiss-pass.ch/swiss-travel-pass-flex/'},
 {id:'ch6',  name:'Swiss Travel Pass Flex 6일',     days:6,  cur:'CHF', price:424, scope:'CH',  source:'https://www.swiss-pass.ch/swiss-travel-pass-flex/'},
 {id:'ch8',  name:'Swiss Travel Pass Flex 8일',     days:8,  cur:'CHF', price:459, scope:'CH',  source:'https://www.swiss-pass.ch/swiss-travel-pass-flex/'}
];
const RESERVATION_FEES = { FR:20, IT:12, ES:15, GB:0, _:0 };

const TRAVELER_TYPES = { any:'누구나', couple:'커플·신혼', solo:'혼자', friends:'친구', family:'아이와 함께', parents:'부모님과' };

const TEMPLATES = [
 {id:'west13',name:'서유럽 첫 여행 13일',types:['solo','friends','couple'],months:[4,5,6,9,10],stops:[['london',3],['paris',3],['interlaken',2],['venice',1],['florence',1],['rome',2]],note:'런던에서 들어가 로마로 나오는 기본 경로'},
 {id:'italy10',name:'이탈리아 3대 도시와 남부 10일',types:['couple','parents','solo'],months:[4,5,6,9,10],stops:[['venice',2],['florence',3],['rome',3],['positano',1]],note:'기차 이동이 쉬운 일자 경로'},
 {id:'swissit11',name:'스위스와 이탈리아 11일',types:['couple','parents','friends'],months:[6,7,8,9],stops:[['zurich',1],['lucerne',1],['grindelwald',3],['milan',1],['venice',1],['florence',1],['rome',2]],note:'여름 알프스와 이탈리아 도시를 함께 묶음'},
 {id:'east9',name:'동유럽 야경 9일',types:['couple','solo','parents'],months:[4,5,6,9,10,12],stops:[['prague',3],['salzburg',1],['hallstatt',1],['vienna',2],['budapest',1]],note:'겨울에는 크리스마스 마켓 일정과 잘 맞음'},
 {id:'iberia14',name:'스페인과 포르투갈 14일',types:['couple','friends','solo'],months:[3,4,5,10,11],stops:[['barcelona',3],['granada',1],['seville',2],['lisbon',3],['porto',2],['madrid',2]],note:'여름 내륙 더위를 피하기 좋은 봄가을 경로'},
 {id:'parislondon9',name:'런던과 파리 느린 9일',types:['family','parents','solo'],months:[4,5,6,9,10,12],stops:[['london',4],['paris',4]],note:'이동을 줄이고 두 도시에 오래 머묾'},
 {id:'family10',name:'아이와 함께 독일 알프스 10일',types:['family'],months:[6,7,8],stops:[['frankfurt',1],['heidelberg',1],['munich',3],['salzburg',2],['interlaken',2]],note:'성, 호수, 산악열차 위주'},
 {id:'north10',name:'북유럽 피오르 10일',types:['couple','parents'],months:[6,7,8],stops:[['helsinki',1],['stockholm',2],['copenhagen',2],['oslo',1],['bergen',3]],note:'여름 낮이 긴 시기에 맞춘 경로'},
 {id:'aurora8',name:'핀란드 겨울 오로라 8일',types:['family','couple'],months:[12,1,2,3],stops:[['helsinki',2],['rovaniemi',4],['helsinki',1]],note:'오로라는 기상에 따라 볼 수 없을 수 있음'},
 {id:'greece9',name:'그리스와 이스탄불 9일',types:['couple','friends'],months:[5,6,9,10],stops:[['istanbul',3],['athens',2],['santorini',3]],note:'섬 구간은 항공이나 페리 필요'},
 {id:'croatia10',name:'아드리아해 10일',types:['couple','friends'],months:[5,6,9],stops:[['vienna',2],['budapest',2],['split',2],['dubrovnik',3]],note:'중부 유럽에서 해안으로 내려가는 경로'},
 {id:'europe21',name:'유럽 일주 21일',types:['solo','friends'],months:[4,5,6,9,10],stops:[['london',3],['paris',4],['interlaken',2],['munich',2],['prague',3],['vienna',2],['venice',1],['florence',1],['rome',2]],note:'여러 나라를 묶으므로 철도 패스 비교가 유용'}
];

const CHECK_BASE = [
 {key:'passport',title:'여권 만료일 확인',days:120,link:'https://www.0404.go.kr/',note:'방문국 입국 요건을 외교부 해외안전여행에서 확인'},
 {key:'insurance',title:'여행자보험 가입',days:30,link:'',note:'파업과 소요 보장은 가입 시점에 따라 달라질 수 있음'},
 {key:'safety',title:'외교부 여행경보 확인',days:14,link:'https://www.0404.go.kr/',note:'도시별 경보 단계 확인'},
 {key:'strike',title:'파업과 교통 공지 확인',days:7,link:'https://www.0404.go.kr/',note:'철도, 항공, 지하철 운영사 공지를 직접 확인'},
 {key:'esim',title:'데이터 로밍 또는 eSIM 준비',days:7,link:'',note:''}
];
const EMERGENCY = [['유럽 공통 긴급전화','112'],['영사콜센터(24시간)','+82-2-3210-0404'],['외교부 해외안전여행','www.0404.go.kr']];

/* 점 지도용 육지 윤곽. 정밀 지도가 아니라 위치 감각을 주는 단순 다각형입니다. [경도, 위도] */
const LAND = [
 /* 유럽 본토 */ [[-9.5,37],[-8.8,41],[-9.3,43.2],[-1.8,43.4],[-1.2,45.5],[-4.7,48.3],[-1.6,48.7],[-1.4,49.7],[1.5,50.2],[3.5,51.4],[4.8,52.9],[7,53.5],[8.7,53.9],[8.2,55.3],[8.1,57],[10.6,57.7],[10.3,55.8],[11,54],[14,54],[18.5,54.7],[21,55.3],[21,57],[24,57.3],[24.2,59.3],[28,59.6],[33,60],[34,48],[36,46.5],[33.5,44.6],[30.6,46.5],[28.7,44],[27.5,42.5],[29,41.2],[26.2,40.1],[26,41],[23.8,40.7],[22.9,40.3],[24,38],[23,36.5],[22.2,36.6],[21.4,37.5],[19.5,40.5],[19.4,42],[16,43.6],[14.6,45.2],[13.6,45.6],[12.3,45.3],[12.5,44],[13.7,43.5],[16,41.8],[18.4,40.1],[17,40.4],[16.6,38.9],[15.7,38],[15.9,40],[14.3,40.8],[12.3,41.7],[10.5,42.9],[10.2,43.9],[8.8,44.4],[7.5,43.8],[6.2,43.1],[4.5,43.4],[3.1,43],[3.2,41.9],[0.8,40.8],[-0.3,39.4],[0.2,38.8],[-0.7,37.7],[-2.2,36.8],[-5.3,36.1],[-6.3,36.8],[-7.5,37.2]],
 /* 영국 */ [[-5.5,50],[1.4,51.1],[1.7,52.7],[0.3,53],[-1.3,54.9],[-2,55.8],[-3,56],[-1.9,57.6],[-3.8,57.7],[-3,58.6],[-5,58.6],[-6.2,57],[-5.4,55.5],[-4.9,54.8],[-3,54.5],[-3,53.4],[-4.6,53.3],[-4.2,52.3],[-5.2,51.8],[-3.2,51.3],[-4.5,51]],
 /* 아일랜드 */ [[-10,51.6],[-6.3,52.2],[-6,53.8],[-5.6,54.6],[-7.2,55.3],[-8.5,54.9],[-10,54.2],[-9.8,53.3],[-9.5,52.6]],
 /* 아이슬란드 */ [[-24,65.5],[-22.6,63.9],[-18.8,63.4],[-14.5,64.4],[-13.6,65.4],[-16,66.5],[-20.5,66],[-22.5,66.4]],
 /* 스칸디나비아 */ [[5,59],[7,58],[10.6,59.2],[11.3,59],[12.7,56.2],[14.3,55.4],[16.4,56.3],[16.7,58.6],[19,59.8],[17.3,61],[17.3,62.8],[21,64.5],[22.3,65.8],[25.3,65.3],[21.4,63],[21.4,61],[23,59.9],[26,60.4],[28,60.5],[32,62.5],[30,66],[30,69.5],[27,71],[20,70],[14.5,67.7],[12,65],[9,63.5],[5.2,62],[4.9,60.5]],
 /* 시칠리아 */ [[12.5,38],[15.6,38.2],[15.1,36.7],[12.5,37.6]],
 /* 사르데냐 */ [[8.2,40.9],[9.7,41.1],[9.6,39.2],[8.5,39]],
 /* 코르시카 */ [[8.6,42.5],[9.4,43],[9.5,42],[9.2,41.4],[8.7,41.8]],
 /* 크레타 */ [[23.6,35.6],[26.3,35.3],[26.1,35],[23.6,35.2]],
 /* 튀르키예 */ [[26.2,40.1],[27.5,40.4],[29.2,41.2],[31.5,41.2],[35,42],[38,41],[41.5,41.5],[44,40],[44,37],[36,36.2],[33,36.1],[30.6,36.8],[28,36.7],[27.3,37.5],[26.5,38.8]],
 /* 북아프리카 */ [[-10,29],[-9.7,31.5],[-6.7,34],[-5.5,35.9],[-2,35.2],[3,36.9],[10,37.3],[11,33.5],[20,31.5],[35,31],[35,28],[-10,28]],
 /* 덴마크 셸란 */ [[10.9,55.3],[11.9,54.8],[12.6,55.7],[11.9,56]],
 /* 마요르카 */ [[2.4,39.6],[3.4,39.9],[3.1,39.3]],
 /* 키프로스 */ [[32.3,34.9],[34.5,35.6],[33.8,34.9]]
];
