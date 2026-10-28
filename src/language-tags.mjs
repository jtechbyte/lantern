// Release-name hints, not verified audio-track metadata.
export const languageLabels = {english:'ENG',spanish:'SPA',french:'FRA',german:'DEU',italian:'ITA',portuguese:'POR',japanese:'JPN',russian:'RUS',ukrainian:'UKR',hindi:'HIN',korean:'KOR',chinese:'ZHO',arabic:'ARA',polish:'POL',czech:'CES',turkish:'TUR',dutch:'NLD',swedish:'SWE',tamil:'TAM',telugu:'TEL'};
const aliases = {
 english:'english|eng',spanish:'spanish|spa|castellano|latino',french:'french|fre|fra|vff|vfq|truefrench',german:'german|ger|deu|deutsch',
 italian:'italian|ita',portuguese:'portuguese|por|ptbr|pt-br',japanese:'japanese|jpn',russian:'russian|rus',ukrainian:'ukrainian|ukr',
 hindi:'hindi|hin',korean:'korean|kor',chinese:'chinese|zho|chi|mandarin|cantonese',arabic:'arabic|ara',polish:'polish|pol',
 czech:'czech|cze|ces',turkish:'turkish|tur',dutch:'dutch|dut|nld',swedish:'swedish|swe',tamil:'tamil|tam',telugu:'tel',
};
export function detectLanguages(title) {
 const text=String(title || '').replace(/_/g,' ');
 // Ignore language words in the movie/show title; read release tags after it.
 const marker=/\b(?:19\d{2}|20\d{2}|S\d{1,3}[ .-]*E\d{1,4}|\d{1,2}x\d{2,3}|(?:4320|2160|1440|1080|720|576|480|360|240)p)\b/i.exec(text);
 const suffix=marker ? text.slice(marker.index+marker[0].length) : (text.match(/\[[^\]]+\]/g)||[]).join(' ');
 return Object.entries(aliases).filter(([,names])=>[...suffix.matchAll(new RegExp(`\\b(?:${names})\\b`,'gi'))].some(match=>{
   const after=suffix.slice(match.index+match[0].length),before=suffix.slice(0,match.index);
   return !/^[ ._-]*(?:subs?\b|subtitles?\b)/i.test(after) && !/(?:subs?|subtitles?)[ ._:-]*$/i.test(before);
 })).map(([language])=>language);
}
