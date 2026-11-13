import type { ComplaintCategory } from '../legal/assumptions';
import { fold, splitSentences } from '../text/sentences';

export interface Detection {
  isComplaint: boolean;
  /** Literal substring of the source text, or null when there is nothing to cite. */
  quote: string | null;
  category: ComplaintCategory;
  ambiguous: boolean;
  needsHumanReview: boolean;
  engine: 'rules' | 'llm';
  ruleId: string | null;
}

interface Rule {
  id: string;
  weight: number;
  re: RegExp;
}

/**
 * Weights: 5 explicit complaint, 3 hidden complaint, 2 ambiguous (human / optional LLM).
 * A how-to question or a thank-you note cannot become a complaint on a weak hit.
 */
const RULES: readonly Rule[] = [
  { id: 'es-reclamo', weight: 5, re: /\b(reclamacion|reclamo|queja)\b/ },
  { id: 'es-inaceptable', weight: 5, re: /\b(inaceptable|indignante|vergonzoso)\b/ },
  { id: 'es-exijo', weight: 5, re: /\b(exijo|exigimos)\b/ },
  { id: 'en-formal-complaint', weight: 5, re: /\b(formal complaint|this is a complaint|i am filing a complaint)\b/ },
  { id: 'en-unacceptable', weight: 5, re: /\bunacceptable\b/ },
  { id: 'en-i-demand', weight: 5, re: /\bi demand\b/ },
  { id: 'en-want-refund', weight: 5, re: /\bi want a refund\b/ },
  { id: 'es-disconformidad', weight: 5, re: /\b(disconformidad|solicito la devolucion)\b/ },
  { id: 'es-quiero-devolv', weight: 5, re: /\bquiero que me (lo )?devolv/ },
  { id: 'en-register-complaint', weight: 5, re: /\b(register a complaint|i wish to complain|raising a complaint|complaining about)\b/ },
  { id: 'en-dissatisfaction', weight: 5, re: /\b(dissatisfaction|request repayment)\b/ },

  { id: 'es-charged', weight: 3, re: /\b(me habeis cobrado|cobrado dos veces|me habeis facturado)\b/ },
  { id: 'es-sigo-sin', weight: 3, re: /\bsigo sin\b/ },
  { id: 'es-llevo-sin', weight: 3, re: /\bllevo\b.+\bsin\b/ },
  { id: 'es-nadie', weight: 3, re: /\bnadie (coge|responde|contesta)\b/ },
  { id: 'es-harto', weight: 3, re: /\b(estoy harto|estamos hartos|harta de llamar)\b/ },
  { id: 'es-outage', weight: 3, re: /\b(sin agua|sin luz|sin suministro|sin electricidad|corte de luz|corte de agua|corte de gas)\b/ },
  { id: 'es-no-aviso', weight: 3, re: /\bno me avisasteis\b/ },

  { id: 'en-charged-me', weight: 3, re: /\bcharged me\b/ },
  { id: 'en-still-not', weight: 3, re: /\b(still have not|you still have not)\b/ },
  { id: 'en-waiting', weight: 3, re: /\bi have been waiting\b/ },
  { id: 'en-without', weight: 3, re: /\b(have been without|still without|without electricity|without water|no water)\b/ },
  { id: 'en-nobody', weight: 3, re: /\bnobody is answering\b/ },
  { id: 'en-tired', weight: 3, re: /\btired of calling\b/ },
  { id: 'en-power', weight: 3, re: /\bpower has been out\b/ },
  { id: 'en-meter', weight: 3, re: /\bdoes not match\b/ },
  { id: 'en-billed', weight: 3, re: /\bkeep being billed\b/ },
  { id: 'en-ignored', weight: 3, re: /\bignored (for|since)\b/ },
  { id: 'es-passing', weight: 3, re: /\b(seguido pasando|no reconozco|no coincide|sin calefaccion|lleva cortada)\b/ },
  { id: 'es-waiting', weight: 3, re: /\b(escribo otra vez|tecnico no vino|sigo esperando|llevo desde\b.+\besperando)\b/ },
  { id: 'en-money-back', weight: 3, re: /\b(kept taking|money back|do not recognise|does not line up)\b/ },
  { id: 'en-outage-broad', weight: 3, re: /\b(no heating|have had no heating|cut off|water supply was interrupted)\b/ },
  { id: 'en-again', weight: 3, re: /\b(writing again|i am writing again|engineer missed|missed both|still waiting)\b/ },
  { id: 'repeat-charge', weight: 5, re: /\b(volviendo a cargar|took the payment again|cobrados de mas)\b/ },
  { id: 'amount-off', weight: 3, re: /\b(no cuadra|does not square)\b/ },
  { id: 'money-wrong', weight: 5, re: /\b(cargo|charge|debit)\b.{0,48}\b(esta mal|is wrong|indebido|undue)\b/ },
  { id: 'give-back', weight: 5, re: /\b(devuelv\w*|reintegro|return the extra)\b/ },
  { id: 'supply-down', weight: 3, re: /\b(no tenemos gas|se fue la luz|a oscuras|estuvo cortada|has been off|no gas|in the dark|went out at)\b/ },
  { id: 'stuck', weight: 3, re: /\b(sigue parado|nadie tramita|still stuck|nobody is processing)\b/ },
  { id: 'protest', weight: 5, re: /\b(protesta|written protest)\b/ },
  {
    id: 'defective-provision',
    weight: 5,
    re: /\b(nunca se realiz\w*|seguis (enviando|cargando)|no sale agua|no ha llegado|sigue sin arreglar|sigue apagand\w*|sin servicio|sin electricidad|tarifa superior|no acudio|nadie aviso\w*|faltan\b.+\bincluid\w*|rechaza mis credenciales|have never been made available|missed the booked|absent from this invoice|higher than the contract|same broken|cannot make or receive|still leaks|was not delivered|not delivered to me|collected twice|has stopped completely|has failed on every|still invoicing|lacks the accessory|unusable since|has been off)\b/,
  },

  { id: 'weak-unhappy-es', weight: 2, re: /\bno estoy contento\b/ },
  { id: 'weak-not-happy', weight: 2, re: /\bnot happy\b/ },
  { id: 'weak-disappointed', weight: 2, re: /\bdisappointed\b/ },
];

const HOW_TO = /^(¿\s*)?(como|cual|cuando|donde|how do i|how can i|what are|what is|where can|can you confirm|can you tell)\b/;
const THANKS = /^(thanks|thank you|gracias)\b/;
const MENTION = /\b(palabra queja|la palabra queja|word complaint|heading says|the word complaint)\b/;
const RHETORICAL = /\b(si esto fuera una queja|if this were a (formal )?complaint|no vengo a poner una queja|not here to (file|make)( a)?( formal)? complaint|not saying it is wrong|no afirmo que este mal|mi unica queja|my only complaint|he leido una resena|una resena que dice|i saw a review|la palabra\b.+\breclamacion|lleva tilde|uses the word complaint|the word complaint|no estoy notificando un problema|not reporting anything wrong|no me ha ocurrido)\b/;
const DENIAL = /\b(no es una queja|no es una reclamacion|ninguna queja|no tengo ninguna queja|not a complaint|this is not a complaint|no formal complaint|no complaint|i have no formal complaint|i have no complaint)\b/;
const ONLY_ASKING = /\b(only asking|solo quiero informacion|just have a question|i just have a question|solo tengo una pregunta)\b/;
const COMPLAINT_WORD = /\b(queja|reclamacion|reclamo|complaint)\b/;
const CONCRETE_HARM = /\b(sin agua|sin luz|sin calefaccion|sin suministro|no heating|cut off|lleva cortada|interrumpid|no coincide|does not line up|does not match|no reconozco|do not recognise|kept taking|seguido pasando|money back|disconformidad|dissatisfaction|repayment|escribo otra vez|writing again|tecnico no vino|engineer missed|exijo|inaceptable|unacceptable)\b/;

const DIGITAL_CHANNEL = /\b(portal|aplicacion|app|website|sitio web|online|intranet|extranet|area de cliente|area de clientes|customer area|self-service|autoservicio)\b/;
const CHANNEL_DOWN = /\b(sin servicio|no service|has no service|out of service|fuera de servicio)\b/;
const SUPPLY_NOUN = 'agua|gas|luz|electricidad|calefaccion|suministro|water|heating|electricity|power';
/** Current interruption of a contracted basic supply, not a named product list. */
const SUPPLY_INTERRUPTION = new RegExp(
  `\\b(?:no llega|sin llegar|seguimos sin|sigue sin|still without|there has been no|has been no|no tenemos|no hay|has had no|have had no)\\s+(?:\\w+\\s+){0,5}(?:${SUPPLY_NOUN})\\b|\\b(?:sin|without)\\s+(?:el\\s+|la\\s+|mi\\s+|our\\s+|any\\s+|the\\s+)?(?:${SUPPLY_NOUN})\\b|\\b(?:suspend\\w*|desconect\\w*|disconnect\\w*|cut off)\\b(?:\\s+\\w+){0,5}\\s(?:${SUPPLY_NOUN})\\b|\\b(?:${SUPPLY_NOUN})\\b(?:\\s+\\w+){0,5}\\s(?:suspend\\w*|desconect\\w*|disconnect\\w*|cut off)\\b|\\bno (?:electricity|power)\\b`,
);
const OUTAGE = /\b(sin agua|sin luz|sin suministro|sin electricidad|sin calefaccion|corte de luz|corte de agua|corte de gas|no water|no sale agua|without water|without electricity|no heating|have had no heating|power has been out|power cut|cut off|blackout|lleva cortada|interrumpid|suministro de agua|water supply|no tenemos gas|se fue la luz|a oscuras|estuvo cortada|has been off|no gas|in the dark|went out at|has stopped completely|cannot make or receive|unusable since|conexion fija|fixed telephone|fixed line)\b/;
const BILLING = /\b(factura\w*|recibo\w*|cobrad\w*|cobro\w*|devolv\w*|reembols\w*|abono\w*|invoic\w*|billed|charg\w*|refund\w*|importe\w*|lectura del contador|meter reading|direct debit|money back|repayment|no coincide|does not line up|no reconozco|do not recognise|cargo\w*|reintegro\w*|no cuadra|does not square|indebido|undue|de mas|volviendo a cargar|took the payment again|return the extra|paid at the counter|cuota|tarifa)\b/;
const NOT_PROVIDER = new Set(['gracias', 'podeis', 'quereis', 'sabeis', 'teneis', 'deberiais', 'podriais']);
const FAILURE = /\b(no|sin|ni|nunca|not|never|without|instead|rather|although|though|despite|pero|aunque|but|pese a|a pesar|twice|dos veces|wrong|incorrect|empty|vacio|cannot|will not|wont|disconnected|disconnect|suspend|discard|refused|unidentified|withdrawn|image-only|difier\w*|diferenc\w*|rechaz\w*)\b/;

const REQUEST = /\b(necesito (que|la|el|una|un)|quiero que|i need|i want)\b/;

function isSuppressed(folded: string): boolean {
  if (MENTION.test(folded) || RHETORICAL.test(folded) || HOW_TO.test(folded) || THANKS.test(folded)) return true;
  const denies = DENIAL.test(folded) || (ONLY_ASKING.test(folded) && COMPLAINT_WORD.test(folded));
  return denies && !CONCRETE_HARM.test(folded);
}

function isPureQuestion(sentence: string): boolean {
  const trimmed = sentence.trim();
  const folded = fold(trimmed);
  return trimmed.startsWith('¿') || /\?\s*$/.test(trimmed) || /^(how|where|what|which|when|who|could|can you|do you|is there|why)\b/.test(folded);
}

/** Second person (vosotros / you, your), excluding auxiliaries and "gracias". */
function hasProvider(folded: string): boolean {
  const withoutThanks = folded.replace(/\bthank you\b/g, ' ');
  if (/\b(you|your)\b/.test(withoutThanks) || /\bhabeis\b/.test(withoutThanks)) return true;
  return withoutThanks.split(/[^a-z]+/).some((word) => word.length >= 5 && /(ais|eis)$/.test(word) && !NOT_PROVIDER.has(word));
}

/** The sentence says there is no defect, or that the harm belongs to someone else. */
function deniesDefect(folded: string): boolean {
  return /\b(ningun (error|problema)|no veo|ninguna queja|no es una (queja|reclamacion)|no estoy describiendo|not reporting|not a problem|have not bought|has not bought|someone else|no tengo (poliza|contrato)|no tengo ningun problema|actuo por esa|no soy esa|not representing|not my experience|i am not a \w+ customer|not my household|sin problema|no ha habido|nothing wrong|coincide con lo contratado|exactly right|son correctos|there is no actual|no estoy notificando)\b/.test(folded);
}

/** What was contracted and what happened are stated against each other. */
function contrastsContract(folded: string): boolean {
  if (deniesDefect(folded)) return false;
  return /\b(contrat\w*|booked|agreed|offer|tarifa|poliza|policy)\b/.test(folded) && FAILURE.test(folded);
}

/**
 * A charge was applied even though the same ticket says the tariff excludes it.
 * The exclusion and the charge may be different sentences.
 */
function isExcludedCharge(sentence: string, document: string): boolean {
  if (isPureQuestion(sentence) || isRequestSentence(sentence)) return false;
  const applied = fold(sentence);
  const doc = fold(document);
  if (applied === doc) return false;
  const providerApplied = hasProvider(applied)
    && /\b(incluid\w*|cobr\w*|factur\w*|charged|added)\b/.test(applied)
    && /\b(cuota|euro\w*|fee|importe|cargo|charge)\b/.test(applied);
  const excluded = /\b(sin (?:cuota|coste|cargo)|without (?:a |any )?(?:fee|charge|cost)|no (?:extra |additional |purchase )?(?:charge|cost|fee))\b/.test(doc);
  return providerApplied && excluded;
}

/**
 * The provider did or omitted something the sentence itself marks as a failure.
 * A question, a remedy request, a thank-you, or a denial is not this class.
 */
function isDefectiveProvision(sentence: string): boolean {
  if (isPureQuestion(sentence) || isRequestSentence(sentence)) return false;
  const folded = fold(sentence);
  if (isSuppressed(folded) || deniesDefect(folded)) return false;
  if (/\b(nothing (has been|was)|son correctos|exactly right|there is no actual|no ha habido)\b/.test(folded)) return false;
  return (hasProvider(folded) || contrastsContract(folded)) && FAILURE.test(folded);
}

/** A past cut cited only as the cause of later damage is not a current interruption. */
function isPastCauseOnly(folded: string): boolean {
  if (!/\b(tras el|tras la|despues del|despues de la|after the)\b/.test(folded)) return false;
  if (/\b(desde|since|seguimos|sigo sin|todavia|still|no tenemos|no llega|no hay|has had no|have had no|sin agua|sin luz|sin electricidad|sin gas|sin suministro)\b/.test(folded)) return false;
  return /\b(danos|se quem\w*|quemad\w*|indemniz\w*|reparacion|burnt|burned)\b/.test(folded);
}

function isSupplyInterruption(folded: string): boolean {
  if (isPastCauseOnly(folded)) return false;
  return SUPPLY_INTERRUPTION.test(folded) || OUTAGE.test(folded);
}

/** A due visit, call, or collection did not happen. */
function missedAttendance(folded: string): boolean {
  return /\b(no (?:apareci\w*|vino|vinieron|avis\w*)|nadie (?:me )?(?:ha )?(?:llam\w*|vino|vini\w*|acud\w*)|nobody (?:turned up|came|rang|called|phoned)|never arrived|hung up|me cuelgan|nos cuelgan|colgaron|sin recoger\w*|been missed)\b/.test(folded);
}

/** A portal, app, or website the customer cannot use. Not a supply interruption. */
function channelUnavailable(folded: string): boolean {
  const channel = /\b(portal|aplicacion|app|website|sitio web)\b/.test(folded);
  const down = /\b(down|no funciona|no me deja|unavailable|service unavailable|error \d+|cannot log|can.?t log)\b/.test(folded);
  return channel && down;
}

/** Mobile or radio service unusable. Not the two-hour basic-supply clock. */
function serviceUnusable(folded: string): boolean {
  return /\b(zero signal|no signal|sin cobertura|calls drop|llamadas se cortan)\b/.test(folded);
}

function concreteDamage(folded: string): boolean {
  return /\b(se quem\w*|quemad\w*|burnt|burned|indemniz\w*)\b/.test(folded);
}

/** The company rejected a fact the customer says they already proved. */
function contradictedDecision(folded: string): boolean {
  return /\b(reject\w*|rechaz\w*|denied|deneg\w*)\b/.test(folded)
    && /\b(but|pero|although|though|uploaded|envie|twice|dos veces)\b/.test(folded);
}

/** Two measured amounts, and the customer says the billed one cannot be right. */
function isQuantityClash(sentence: string, document: string): boolean {
  if (isPureQuestion(sentence)) return false;
  const doc = fold(document);
  const nums = doc.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (new Set(nums.map((value) => value.replace(',', '.'))).size < 2) return false;
  const measured = /[£€]|\b(m3|kwh|eur|euros|factura|bill|cuota)\b/.test(doc);
  const contrast = /\b(anterior|worth|but|pero|sin partes|nothing changed|piso cerrado|cerrado|pasa de|subid\w*|corregir|fix it|fix the)\b/.test(doc);
  if (!measured || !contrast) return false;
  const folded = fold(sentence);
  return /\d/.test(folded) && (/[£€]|\b(m3|kwh|eur|euros|factura|bill|cuota)\b/.test(folded));
}

function hasDisputeFigure(sentence: string): boolean {
  return /[£€]|\b\d+(?:[.,]\d+)?\s*(?:eur|euros|m3|kwh)\b/i.test(sentence);
}

/** The sum the customer says is wrong, once the ticket has already alleged a bad bill. */
function statesDisputedSum(sentence: string, document: string): boolean {
  if (isPureQuestion(sentence) || isRequestSentence(sentence)) return false;
  if (!hasDisputeFigure(sentence)) return false;
  if (!/\b(owe|debo|penalizaci\w*|importe)\b/i.test(sentence)) return false;
  return /\b(estimated|estimad|even though|aunque|lectura|reading|penalizaci|late fee)\b/.test(fold(document));
}

/** Harm described as someone else's review, exercise, or news, and disowned by the writer. */
function customerDisowns(text: string): boolean {
  const folded = fold(text);
  const other = /\b(otra persona|someone else|someone i do not know|not representing|actuo por esa|yo no tengo poliza|have not bought|i am not a \w+ customer|not my household|no soy esa persona|that is not my|i am not submitting|no gestiono su caso|not my experience|no tengo ningun problema)\b/;
  const frame = /\b(resena|review|noticia|case study|he leido|i copied|ejercicio de clase|language exercise|public review|vecina|me dijo)\b/;
  return other.test(folded) && frame.test(folded);
}

function stripQuotations(text: string): string {
  return text
    .replace(/«[^»]*»/g, ' ')
    .replace(/“[^”]*”/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/'[^']{12,}'/g, ' ');
}

/** A class exercise about how to say "complaint", not a complaint. */
function isLanguageDrill(folded: string): boolean {
  return /\b(para un ejercicio|ejercicio de clase|soy profesora|writing an essay|es correcto decir|lodge a complaint)\b/.test(folded);
}

/** Asking what the word complaint means, while denying a problem of one's own. */
function isMetaWordQuestion(folded: string): boolean {
  const asks = /\b(que significa|what does the word|does the word|significa aqui la palabra|la palabra)\b/.test(folded);
  const denies = /\b(no estoy describiendo|not reporting|ningun problema|not a problem|glossary|glosario)\b/.test(folded);
  return asks && denies;
}

export interface SentenceScore {
  weight: number;
  ruleId: string | null;
}

export function scoreSentence(sentence: string, document = ''): SentenceScore {
  const folded = fold(sentence);
  let best: SentenceScore = { weight: 0, ruleId: null };
  for (const rule of RULES) {
    if (rule.re.test(folded) && rule.weight > best.weight) {
      best = { weight: rule.weight, ruleId: rule.id };
    }
  }
  if (isSuppressed(folded)) return { weight: 0, ruleId: null };
  if (!isPureQuestion(sentence) && best.weight < 5) {
    if (isSupplyInterruption(folded)) best = { weight: 5, ruleId: 'supply-interrupted' };
    else if (
      isDefectiveProvision(sentence)
      || isExcludedCharge(sentence, document || sentence)
      || missedAttendance(folded)
      || channelUnavailable(folded)
      || serviceUnusable(folded)
      || concreteDamage(folded)
      || contradictedDecision(folded)
      || isQuantityClash(sentence, document || sentence)
      || statesDisputedSum(sentence, document || sentence)
    ) {
      best = { weight: 5, ruleId: 'defective-act' };
    }
  }
  return best;
}

const DEFECT = /\b(nunca se realiz|seguis (enviando|cargando)|no sale agua|no ha llegado|sigue sin arreglar|sigue apagand|sin servicio|sin electricidad|tarifa superior|no acudio|nadie aviso|rechaza mis credenciales|have never been made available|missed the booked|absent from this invoice|higher than the contract|same broken|cannot make or receive|still leaks|was not delivered|not delivered|collected twice|has stopped completely|has failed on every|still invoicing|lacks the accessory|unusable since|has been off|cobrado dos veces|dos veces el mismo)\b/;

function harmRank(sentence: string): number {
  const folded = fold(sentence);
  if (isSupplyInterruption(folded)) return 3;
  if (BILLING.test(folded) || /[£€]/.test(sentence) || /\b(penalizaci\w*|estimated bills|late (?:payment )?fee)\b/.test(folded)) return 2;
  return 0;
}

function defectRank(sentence: string, document = ''): number {
  if (isPureQuestion(sentence) || isRequestSentence(sentence)) return 0;
  const folded = fold(sentence);
  if (deniesDefect(folded) || isSuppressed(folded)) return 0;
  if (isSupplyInterruption(folded)) return 3;
  if (isExcludedCharge(sentence, document || sentence)) return 2;
  if (hasProvider(folded) && FAILURE.test(folded)) return 2;
  if (
    missedAttendance(folded)
    || channelUnavailable(folded)
    || serviceUnusable(folded)
    || concreteDamage(folded)
    || contradictedDecision(folded)
    || isQuantityClash(sentence, document || sentence)
    || statesDisputedSum(sentence, document || sentence)
  ) return 2;
  if (isDefectiveProvision(sentence) || DEFECT.test(folded)) return 1;
  return 0;
}

export function isRequestSentence(sentence: string): boolean {
  return REQUEST.test(fold(sentence));
}

/**
 * The 2-hour clock is only for continuity of a contracted basic supply.
 * "Sin servicio" on a portal, app, or document tool stays a general complaint.
 */
function allegesBilling(text: string): boolean {
  return splitSentences(text).some((sentence) => {
    const folded = fold(sentence);
    if (/\b(not disputing|no discuto|no impugn|supply itself is fine)\b/.test(folded)) return false;
    if (/\b(facturas de reparacion|repair invoices|ver mis facturas|submit my meter reading|meter reading before the deadline)\b/.test(folded)) return false;
    if (BILLING.test(folded)) return true;
    if (/\b(penalizaci\w*|late (?:payment )?fee|estimated bills)\b/.test(folded)) return true;
    if (/[£€]/.test(sentence) && /\b(but|pero|worth|owe|debo|penalizaci|fee|instead|although|though|pasa de)\b/.test(folded)) return true;
    return /\b(euro\w*|bill|bills|credito|credit)\b/.test(folded)
      && /\b(instead|rather|but|pero|aunque|adds|subtract|de mas|twice|dos veces|worth|owe)\b/.test(folded);
  });
}

export function categorize(text: string): ComplaintCategory {
  const folded = fold(text);
  const interrupted = isSupplyInterruption(folded);
  const digitalDown = DIGITAL_CHANNEL.test(folded) && CHANNEL_DOWN.test(folded) && !interrupted;
  if (!digitalDown && interrupted) return 'outage';
  if (allegesBilling(text)) return 'billing';
  return 'general';
}

function contextSuppressesLexicon(text: string): boolean {
  const folded = fold(text);
  if (isMetaWordQuestion(folded) || isLanguageDrill(folded)) return true;
  if (DEFECT.test(folded) || OUTAGE.test(folded) || SUPPLY_INTERRUPTION.test(folded)) return false;
  return /\b(todo funciona|funciona correctamente|works exactly|valoracion positiva|positive review|lleva tilde|no estoy notificando un problema|not reporting anything wrong|uses the word complaint)\b/.test(folded);
}

export function detectByRules(text: string): Detection {
  const scoped = customerDisowns(text) ? stripQuotations(text) : text;
  const suppressLexicon = contextSuppressesLexicon(scoped);
  let bestWeight = 0;
  let bestSentence = '';
  let bestRule: string | null = null;
  let sawAmbiguous = false;

  for (const sentence of splitSentences(scoped)) {
    let score = scoreSentence(sentence, scoped);
    if (suppressLexicon && defectRank(sentence, scoped) === 0) score = { weight: 0, ruleId: null };
    if (score.weight === 2) sawAmbiguous = true;
    const defectDelta = defectRank(sentence, scoped) - defectRank(bestSentence, scoped);
    const bothStrong = defectRank(sentence, scoped) >= 2 && defectRank(bestSentence, scoped) >= 2;
    const figureBeats = bothStrong && hasDisputeFigure(sentence) && !hasDisputeFigure(bestSentence);
    const richerTie =
      score.weight === bestWeight &&
      score.weight > 0 &&
      (defectDelta > 0 ||
        figureBeats ||
        (defectDelta === 0 && !figureBeats && !(bothStrong && hasDisputeFigure(bestSentence) && !hasDisputeFigure(sentence)) && (
          harmRank(sentence) > harmRank(bestSentence) ||
          (harmRank(sentence) === harmRank(bestSentence) && sentence.length > bestSentence.length)
        )));
    if (score.weight > bestWeight || richerTie) {
      bestWeight = score.weight;
      bestSentence = sentence;
      bestRule = score.ruleId;
    }
  }

  if (bestWeight >= 3 && bestSentence && text.includes(bestSentence)) {
    return {
      isComplaint: true,
      quote: bestSentence,
      category: categorize(scoped),
      ambiguous: false,
      needsHumanReview: false,
      engine: 'rules',
      ruleId: bestRule,
    };
  }

  return {
    isComplaint: false,
    quote: null,
    category: 'none',
    ambiguous: sawAmbiguous,
    needsHumanReview: sawAmbiguous,
    engine: 'rules',
    ruleId: null,
  };
}

export function extractPoints(text: string, detection: Pick<Detection, 'isComplaint' | 'quote'>): string[] {
  if (!detection.isComplaint) return [];
  const points: string[] = [];
  for (const sentence of splitSentences(text)) {
    const score = scoreSentence(sentence, text);
    if (score.weight >= 3 || isRequestSentence(sentence)) {
      if (!points.includes(sentence)) points.push(sentence);
    }
  }
  if (detection.quote && text.includes(detection.quote) && !points.includes(detection.quote)) {
    points.unshift(detection.quote);
  }
  return points;
}
