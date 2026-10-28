'use strict';
const uiEl=(tag,text,className)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;};
const uiGet=selector=>document.querySelector(selector);
function uiCard(title,icon){const card=uiEl('section',null,'card refined-card'),heading=uiEl('h2',title);if(icon)heading.prepend(dashboardIcon(icon));card.append(heading);return card;}
function companion(panel,index,card){panel.viewGroups[index][1].push(card);card.hidden=panel.viewGroups[index][1][0].hidden;panel.append(card);}
function labelText(input,text){input.closest('label').replaceChildren(document.createTextNode(text),input);}
function feedback(id){const p=uiEl('p',null,'inline-feedback');p.id=id;p.setAttribute('role','status');return p;}

// Keep every original input and its form association.
const appearance=uiGet('#panel-appearance');appearance.classList.add('refined-section');
const previewControls=uiEl('div',null,'preview-controls');uiGet('[name=formatIcons]').closest('label').before(previewControls);previewControls.append(uiGet('[name=formatIcons]').closest('label'),uiGet('[name=formatSeeders]').closest('label'),uiGet('#format-preview'));
const logo=uiGet('[name=logo]');labelText(logo,'Logo URL');const logoHelp=uiEl('p','Optional. Use an HTTPS image URL.','muted');logoHelp.id='logo-guidance';logo.closest('label').after(logoHelp);logo.setAttribute('aria-describedby',logoHelp.id);
const sample=uiGet('#format-sample'),previewBox=uiEl('div',null,'layout-preview');
const previewHeading=uiEl('div',null,'preview-heading');previewHeading.append(uiEl('strong','Layout preview'),uiEl('span','Example','quiet-badge'));sample.before(previewBox);previewBox.append(previewHeading,sample);

const playbackPanel=uiGet('#panel-playback');playbackPanel.classList.add('refined-section');
const delivery=playbackPanel.viewGroups[0][1][0];delivery.classList.add('delivery-card');delivery.querySelector('h3').textContent='Delivery and sorting';delivery.querySelector('h3').prepend(dashboardIcon('playback'));
const provider=uiCard('Provider account','discovery');provider.classList.add('provider-card');
provider.append(uiEl('p','Manage your Real-Debrid account and token.','muted'));
const tokenState=uiEl('div',null,'account-state');tokenState.id='provider-token-state';provider.append(tokenState);
const tokenInput=uiGet('[name=rdToken]');tokenInput.placeholder='Enter a replacement token';provider.append(tokenInput.closest('label'));
const tokenHelp=uiEl('p','Leave blank to keep the saved token. Account tests use the saved token.','muted');tokenHelp.id='rd-token-help';provider.append(tokenHelp);tokenInput.setAttribute('aria-describedby',tokenHelp.id);
provider.append(uiGet('#rd-test').closest('.actions'),uiGet('#rd-status'),uiGet('[name=rdFilenameMode]').closest('label'));
provider.querySelector('#rd-status').setAttribute('role','status');provider.querySelector('#rd-status').classList.add('inline-feedback');provider.querySelector('#rd-clear').classList.add('danger');
delivery.querySelector('h3').after(uiEl('p','Configure how streams are delivered and sorted.','muted'));
const sortHelp=uiEl('p','Results are ordered within each source and resolution.','muted');delivery.append(sortHelp);companion(playbackPanel,0,provider);

const discoveryPanel=uiGet('#panel-discovery');discoveryPanel.classList.add('refined-section');
const limits=discoveryPanel.viewGroups[0][1][0];limits.classList.add('result-preferences');
const fields=limits.querySelector('.two');
const resultGroup=uiEl('fieldset',null,'preference-group'),sizeGroup=uiEl('fieldset',null,'preference-group');
resultGroup.append(uiEl('legend','Result limits'));sizeGroup.append(uiEl('legend','Size and availability'));
const resultFields=uiEl('div',null,'two'),sizeFields=uiEl('div',null,'two');
for(const name of ['maxResults','perQuality'])resultFields.append(uiGet(`[name=${name}]`).closest('label'));
for(const name of ['maxSizeGB','minSeeders'])sizeFields.append(uiGet(`[name=${name}]`).closest('label'));
resultGroup.append(resultFields);sizeGroup.append(sizeFields);fields.replaceWith(resultGroup,sizeGroup);
labelText(uiGet('[name=perQuality]'),'Results per quality');const sizeInput=uiGet('[name=maxSizeGB]');labelText(sizeInput,'Maximum file size');
const unit=uiEl('span',null,'input-unit');sizeInput.before(unit);unit.append(sizeInput,uiEl('span','GiB'));const sizeHelp=uiEl('small','0 means unlimited.','field-help');sizeHelp.id='size-help';unit.after(sizeHelp);sizeInput.setAttribute('aria-describedby',sizeHelp.id);
uiGet('[name=preferLanguage]').closest('label').classList.add('language-preference');
const summary=uiCard('Current preferences','document');summary.classList.add('preferences-summary');summary.append(uiEl('p','From your current form values.','muted'));const summaryList=uiEl('dl');summaryList.id='preference-values';summary.append(summaryList);const summaryState=feedback('preferences-state');summary.append(summaryState,uiEl('p','Changes apply only when you save configuration.','muted'));companion(discoveryPanel,0,summary);
function updatePreferenceSummary(){const fields=[['Total result limit','maxResults'],['Per-quality limit','perQuality'],['Maximum file size','maxSizeGB'],['Minimum seeders','minSeeders'],['Language','preferLanguage']];summaryList.replaceChildren();for(const [label,name] of fields){const input=uiGet(`[name=${name}]`);let value=input.value;if(name==='preferLanguage')value=input.selectedOptions[0]?.textContent||'Not selected';else if(value===''||!input.validity.valid)value='Enter a valid value';else if(name==='maxSizeGB')value=Number(value)===0?'Unlimited':`${value} GiB`;const row=uiEl('div');row.append(uiEl('dt',label),uiEl('dd',value));summaryList.append(row);}summaryState.textContent=uiGet('#save-state').textContent;summaryState.dataset.state=uiGet('#save-state').dataset.state;}
for(const type of ['input','change'])discoveryPanel.addEventListener(type,()=>queueMicrotask(updatePreferenceSummary));
new MutationObserver(updatePreferenceSummary).observe(uiGet('#save-state'),{childList:true,attributes:true,attributeFilter:['data-state']});

const search=uiGet('#panel-search');search.classList.add('refined-section');const searchFormCard=search.viewGroups[0][1][0];searchFormCard.classList.add('search-form-card');searchFormCard.querySelector('.eyebrow')?.remove();searchFormCard.querySelector('h2').textContent='New search';searchFormCard.querySelector('h2').prepend(dashboardIcon('search'));
searchFormCard.querySelector(':scope > p').textContent='Search by IMDb or Stremio ID.';
labelText(uiGet('#media-id'),'IMDb / Stremio ID');const idHelp=uiEl('small','Movie: tt1234567 · Episode: tt1234567:1:2','field-help');idHelp.id='media-id-help';uiGet('#media-id').after(idHelp);uiGet('#media-id').setAttribute('aria-describedby',idHelp.id);
searchFormCard.querySelector(':scope > p:last-child').textContent='First searches can take up to 12 seconds. Source cooldowns still apply.';
const searchStatus=uiCard('Search status','search');searchStatus.classList.add('search-status-card');const searchHead=uiEl('div',null,'section-head');searchHead.append(searchStatus.querySelector('h2'),uiGet('#refresh'));searchStatus.append(searchHead);
const searchFeedback=feedback('search-status');searchFeedback.textContent='Not started. Start a search to inspect matches and exclusions.';searchStatus.append(searchFeedback);
const cooldown=uiEl('p',null,'muted');cooldown.id='search-cooldown';searchStatus.append(cooldown,uiEl('h3','Monitoring'),uiEl('p','Monitoring refreshes this exact movie or episode.','muted'));const monitoring=feedback('monitor-status');monitoring.textContent='Choose a title to see its monitoring status.';searchStatus.append(monitoring);companion(search,0,searchStatus);
// Status stays visible beside both the form and its results.
search.viewGroups[1][1].push(searchStatus);

const libraryPanel=uiGet('#panel-library');libraryPanel.classList.add('refined-section');const policy=libraryPanel.viewGroups[0][1][0];policy.classList.add('filename-policy');policy.querySelector('h2').textContent='Filename policy';policy.querySelector('h2').prepend(dashboardIcon('document'));
const policyCheck=uiGet('[name=blockIndexFilenames]'),policyLabel=policyCheck.closest('label');policyLabel.replaceChildren(policyCheck,document.createTextNode('Block filename-rule matches'));policyLabel.after(uiEl('p','Apply filename rules before saving matches to the database.','muted'));
const warning=uiEl('div',null,'policy-warning');warning.append(uiEl('strong','Strict filtering can exclude working releases.'),uiEl('p','Checks release titles, torrent names, and selected filenames.'));
const oldWarning=policy.querySelectorAll(':scope > p')[1];oldWarning.replaceWith(warning);
const explanation=uiCard('How this policy works','installation');explanation.classList.add('policy-explanation');
for(const [title,text,icon] of [['Before saving','Matches are checked before database storage.','document'],['Separate from playback','This policy does not replace playback filtering.','playback'],['Preview first','Review matches before any cleanup.','search']]){const item=uiEl('div',null,'explanation-row'),content=uiEl('div');content.append(uiEl('strong',title),uiEl('p',text,'muted'));item.append(dashboardIcon(icon),content);explanation.append(item);}
explanation.append(uiEl('p','Rules are empirical. Acceptance is not guaranteed.','rule-note'));companion(libraryPanel,0,explanation);

const users=uiGet('#panel-users');users.classList.add('refined-section');const inviteCard=uiGet('#invite-form').closest('.card'),profilesCard=uiGet('#profile-list').closest('.card');inviteCard.classList.add('invitation-card');profilesCard.classList.add('profiles-card');inviteCard.querySelector('h2').prepend(dashboardIcon('users'));
inviteCard.querySelector(':scope > p').textContent='Each person uses their own Real-Debrid account and private installation link.';
const invitationNote=inviteCard.querySelector(':scope > p.muted');invitationNote.textContent='Share the invitation privately. Lantern does not send email.';
const badges=uiEl('div',null,'invitation-badges');badges.id='invitation-policy';invitationNote.before(badges,feedback('invite-feedback'));
inviteCard.append(uiEl('p','They cannot access your dashboard or admin token.','account-separation'));
const revocation=profilesCard.querySelector(':scope > p'),disclosure=uiEl('details',null,'revocation-details');disclosure.append(uiEl('summary','About revoking access'),revocation);profilesCard.append(disclosure);
const profileCount=uiEl('span',null,'quiet-badge');profileCount.id='profile-count';profilesCard.querySelector('h2').append(profileCount);
const capacity=uiEl('p',null,'muted');capacity.id='profile-capacity';disclosure.before(capacity);profilesCard.querySelector('.section-head').after(feedback('profiles-feedback'));
uiGet('#profiles-feedback').after(uiGet('#invite-result'));
