import { e, fullDate, btn, field, input, select, form, submit, show } from './components.js'
import { state, demo, officer, pollsData, officerPollResults } from './model.js'

function pollForm(poll) {
  const invited = new Set(poll?.invites ?? [])
  const fields = (poll ? '<input type="hidden" name="revision" value="' + poll.revision + '">' : '') +
    field('Fråga',input('question',poll?.question,'required maxlength="120"')) +
    field('Beskrivning (valfritt)','<textarea name="description" maxlength="1000">' + e(poll?.description) + '</textarea>') +
    field('Svarsalternativ, ett per rad','<textarea name="options" maxlength="655" required placeholder="Ja&#10;Nej">' +
      e(poll?.options.join('\n')) + '</textarea>') +
    field('Vilka får rösta?',select('audience',[['all','Hela guilden'],['selected','Utvalda medlemmar']],poll?.restricted?'selected':'all')) +
    '<fieldset class="group" data-poll-invites' + (poll?.restricted ? '' : ' hidden disabled') + '><legend>Bjud in medlemmar</legend><div class="poll-invite-list">' +
    state.members.filter(item=>item.status==='active').map(item=>'<label class="poll-choice"><input type="checkbox" name="invited" value="' +
      e(item.id) + '"' + (invited.has(item.id)?' checked':'') + '> ' + e(item.name) + '</label>').join('') + '</div></fieldset>' +
    '<p class="hint">Mellan två och åtta alternativ. Medlemmarna kan ändra sin röst tills omröstningen stängs.</p>'
  show(poll?'Redigera omröstning':'Skapa omröstning',form(poll?'poll-edit/'+poll.id:'poll-create',fields,submit(poll?'Spara ändringar':'Öppna omröstning')))
}

function pollsPage() {
  const header = '<div class="page-head"><div><h1>Omröstningar</h1></div>' +
    (officer() && !demo ? btn('Skapa omröstning','poll-create','primary','plus') : '') + '</div>'
  if (!pollsData.length || demo) return header + '<section class="card"><p>Inga omröstningar ännu.</p></section>'
  return header + '<div class="stack">' + pollsData.map(poll => {
    const closed = poll.closed_at !== null
    const total = poll.results?.reduce((sum,value)=>sum+value,0) ?? 0
    const choices = poll.options.map((option,index)=> closed
      ? '<div class="row"><span>' + e(option) + (poll.own_vote===index ? ' <small>Din röst</small>' : '') +
        '</span><strong>' + poll.results[index] + ' · ' + (total ? Math.round(100*poll.results[index]/total) : 0) + ' %</strong></div>'
      : '<label class="poll-choice"><input type="radio" name="option" value="' + index + '" required' +
        (poll.own_vote===index?' checked':'') + '> ' + e(option) + '</label>').join('')
    return '<section class="card"><h3>' + e(poll.question) + '</h3><p>' + (closed ? 'Avslutad' : 'Öppen') +
      ' · ' + e(poll.organizer) + (poll.restricted ? ' · Utvalda medlemmar' : '') + ' · ' + fullDate(closed ? poll.closed_at : poll.created_at) + '</p>' +
      (poll.description ? '<p class="description">' + e(poll.description) + '</p>' : '') +
      (closed ? choices + '<p class="hint section">Totalt ' + total + ' röster.</p>' :
        (poll.can_vote ? form('poll-vote/'+poll.id,'<input type="hidden" name="revision" value="' + poll.revision + '">' + choices,submit(poll.own_vote===null?'Rösta':'Ändra röst')) :
          '<p class="hint">Omröstningen är öppen för de inbjudna.</p>') +
        (officer() ? '<div class="actions roster">' + (poll.can_edit ? btn('Redigera','poll-edit/'+poll.id) : '') + btn('Stäng omröstningen','poll-close/'+poll.id) + '</div>' : '')) + '</section>'
  }).join('') + '</div>'
}

function officerPollArchive() {
  if (!officerPollResults.polls.length) return '<section class="card"><p>Inga avslutade omröstningar ännu.</p></section>'
  return '<div class="stack">' + officerPollResults.polls.map(poll => {
    const total = poll.results.reduce((sum,votes)=>sum+votes,0)
    return '<details class="card poll-record"><summary><strong>' + e(poll.question) + '</strong><small>Stängdes ' +
      fullDate(poll.closed_at) + ' · ' + total + ' röster</small></summary>' +
      '<p class="hint">Startad av ' + e(poll.organizer) + ' · ' + (poll.restricted ? 'Utvalda medlemmar' : 'Hela guilden') + '</p>' +
      (poll.description ? '<p class="description">' + e(poll.description) + '</p>' : '') +
      poll.options.map((option,index)=>'<div class="row"><span>' + e(option) + '</span><strong>' + poll.results[index] + ' · ' +
        (total ? Math.round(100*poll.results[index]/total) : 0) + ' %</strong></div>').join('') + '</details>'
  }).join('') + (officerPollResults.next ? btn('Visa äldre resultat','poll-results-more') : '') + '</div>'
}

export { pollForm, pollsPage, officerPollArchive }
