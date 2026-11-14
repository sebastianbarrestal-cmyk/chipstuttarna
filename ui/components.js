import { state } from './model.js'

const $ = selector => document.querySelector(selector)
const main = $('#main')
const dialog = $('#dialog')
const paths = {
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4m-4-12a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  shield:'<path d="m12 22 5-4c3-2 4-6 4-12l-9-4-9 4c0 6 1 10 4 12z"/>',
  sword:'<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6m-1 5 3 3M6 18l-3 3m5-2-3-3m7-7 6-6h3v3l-6 6"/>',
  chart:'<path d="M3 3v18h18M8 16v-4m5 4V8m5 8V5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  exit:'<path d="M10 17l5-5-5-5m5 5H3m9-9h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
}
const icon = name => '<svg class="ico" aria-hidden="true" viewBox="0 0 24 24">' + paths[name] + '</svg>'
const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char])
const roleName = {owner:'Ägare',admin:'Admin',officer:'Officerare',member:'Medlem'}
const statusName = {yes:'Kommer',maybe:'Kanske',no:'Kan inte'}
const gameRoles = ['Tank','Healer','DPS']
const classes = ['Druid','Hunter','Mage','Paladin','Priest','Rogue','Shaman','Warlock','Warrior']
const format = (date, options) => new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Stockholm', ...options }).format(date)
const clock = date => format(date,{hour:'2-digit',minute:'2-digit'})
const fullDate = date => format(date,{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})
const eventTypes = {raid:'Raid',dungeon:'Dungeon',pvp:'PvP'}
const tag = event => '<span class="tag ' + event.kind + '">' + eventTypes[event.kind] + '</span>'
const officialBadge = event => event.official
  ? '<span class="tag official">' + e(state.officialSettings?.label || 'Officiellt') + '</span>' : ''
const btn = (label, action, style = '', symbol = '') => '<button type="button" class="btn ' + style + '" data-action="' + action + '">' + (symbol ? icon(symbol) : '') + label + '</button>'
const options = (values, chosen) => values.map(item => {
  const [value, label] = Array.isArray(item) ? item : [item,item]
  return '<option value="' + e(value) + '"' + (value === chosen ? ' selected' : '') + '>' + e(label) + '</option>'
}).join('')
const field = (label, input) => '<label>' + label + input + '</label>'
const initials = name => name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()

async function api(path, payload) {
  const response = await fetch('/api/' + path, payload ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)} : {})
  let data
  try { data = await response.json() } catch {}
  if (!response.ok) throw Object.assign(new Error(data?.error || 'Guildsidan kunde inte nås. Försök igen.'), { status:response.status })
  return data
}

function toast(text) {
  $('#notice').textContent = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { $('#notice').textContent = '' }, 3600)
}

function show(title, contents, subtitle = '') {
  dialog.innerHTML = '<div class="inner"><div class="dialog-head"><div><h2 id="dialog-title">' + e(title) + '</h2>' +
    (subtitle ? '<p class="kicker">' + e(subtitle) + '</p>' : '') + '</div><button class="btn icon-only" type="button" data-action="close" aria-label="Stäng">' + icon('close') + '</button></div>' + contents + '</div>'
  if (!dialog.open) dialog.showModal()
}

const form = (kind, fields, footer, style = '') => '<form class="form ' + style + '" data-form="' + kind + '">' + fields +
  '<p class="error" role="alert" hidden></p><footer>' + footer + '</footer></form>'
const submit = label => '<button type="submit" class="btn primary">' + label + '</button>'
const input = (name, value, attrs = '') => '<input name="' + name + '" value="' + e(value) + '" ' + attrs + '>'
const select = (name, values, value) => '<select name="' + name + '">' + options(values,value) + '</select>'


let noticeTimer

export { $, main, dialog, icon, e, roleName, statusName, gameRoles, classes, format, clock, fullDate, eventTypes, tag, officialBadge, btn, options, field, initials, api, toast, show, form, submit, input, select }
