// All DOM interface: title, HUD, menus, shrine, map, journal, settings, and controller/keyboard navigation.
import { ITEMS, RECIPES, MERCHANT, itemName, upgradeCost } from './items.js';
import { WORLD, QUALITY } from './config.js';
import { MAP_N } from './world/mapgen.js';
import { FOG_N, peekSave } from './state.js';
import { clamp, dist2, angleWrap, fmtInt } from './core/util.js';
import { randomSeedString } from './core/rng.js';
import { BIOMES } from './world/gen.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TYPE_LABEL = {
  keep: 'Keep', cathedral: 'Cathedral', necropolis: 'Necropolis', hamlet: 'Hamlet', shrine: 'Shrine', watchtower: 'Watchtower',
  stones: 'Standing stones', camp: 'Camp', gallows: 'Gallows', wreck: 'Wreck', cairn: 'Cairn', crypt: 'Crypt',
};
const STAT_INFO = {
  vigor: ['Vigor', 'More health'],
  endurance: ['Endurance', 'More stamina'],
  might: ['Might', 'Harder blows'],
  resolve: ['Resolve', 'Dread builds slower'],
};

export class UI {
  constructor(game) {
    this.game = game;
    this.stack = [];
    this.hud = $('#hud');
    this.el = {
      hp: $('.bar.hp i'), hpLag: $('.bar.hp b'), st: $('.bar.st i'), dr: $('.bar.dr i'),
      embers: $('#embers em'), clock: $('#clock'), strip: $('#compass-strip'), prompt: $('#prompt'),
      promptText: $('#prompt span'), flaskN: $('#flask-n'), bombN: $('#bomb-n'), boss: $('#bossbar'),
      bossName: $('#bossbar .bname'), bossFill: $('#bossbar .bbar i'), hurt: $('#hurt'), veil: $('#dread-veil'),
      objective: $('#objective'), toasts: $('#toasts'), pickups: $('#pickups'), fps: $('#fps'), mini: $('#minimap'),
    };
    this.miniCtx = this.el.mini.getContext('2d');
    this.hpLag = 1;
    this.miniT = 0;
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = this.mapCanvas.height = MAP_N;
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = this.fogCanvas.height = FOG_N;
    this.fogDirty = true;
    this._bind();
  }

  // ---------- screens ----------
  open(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    if (!this.stack.includes(id)) this.stack.push(id);
    this.game.input.clearAll();
    requestAnimationFrame(() => {
      const f = el.querySelector('button:not([disabled]):not([hidden]), input');
      if (f && !document.body.classList.contains('touch')) f.focus({ preventScroll: true });
    });
  }
  close(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
    this.stack = this.stack.filter((s) => s !== id);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  closeAll() {
    for (const id of [...this.stack]) this.close(id);
  }
  get modalOpen() {
    return this.stack.some((s) => !['hud'].includes(s));
  }
  top() {
    return this.stack[this.stack.length - 1];
  }

  _bind() {
    const g = this.game;
    const click = (sel, fn) => $(sel).addEventListener('click', () => { g.audio.play('ui'); fn(); });
    click('#t-new', () => {
      $('#seed-input').value = randomSeedString();
      $('#ng-warn').hidden = !peekSave();
      this.open('newgame');
    });
    click('#seed-random', () => { $('#seed-input').value = randomSeedString(); });
    click('#ng-back', () => this.close('newgame'));
    click('#ng-begin', () => {
      const seed = $('#seed-input').value.trim() || randomSeedString();
      this.closeAll();
      g.startNew(seed);
    });
    click('#t-continue', () => { this.closeAll(); g.continueGame(); });
    click('#t-settings', () => { this.renderSettings($('#settings-body')); this.open('settings-screen'); });
    click('#settings-close', () => this.close('settings-screen'));
    click('#t-help', () => this.open('help'));
    click('#help-close', () => this.close('help'));
    click('#btn-menu', () => g.openMenu('gear'));
    this.el.mini.addEventListener('click', () => g.openMenu('map'));
    this.el.mini.addEventListener('pointerdown', (e) => e.stopPropagation());
    click('#m-resume', () => g.closeMenu());
    click('#m-quit', () => g.saveAndQuit());
    click('#s-leave', () => g.leaveShrine());
    click('#reader-close', () => { this.close('reader'); g.resume(); });
    click('#trade-close', () => { this.close('trade'); g.resume(); });
    click('#d-respawn', () => g.respawn());
    click('#e-continue', () => { this.close('ending'); g.resume(); });
    for (const b of $$('#menu [data-tab]')) b.addEventListener('click', () => { g.audio.play('ui'); this.menuTab(b.dataset.tab); });
    for (const b of $$('#shrine [data-stab]')) b.addEventListener('click', () => { g.audio.play('ui'); this.shrineTab(b.dataset.stab); });
    $('#seed-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#ng-begin').click(); e.stopPropagation(); });
  }

  refreshTitle() {
    const info = peekSave();
    $('#t-continue').hidden = !info;
    $('#t-save-info').textContent = info ? `Saved journey: seed “${info.seed}”, level ${info.level}, ${info.beacons}/6 beacons lit.` : '';
  }

  loading(p, seed) {
    $('#load-fill').style.width = `${Math.round(p * 100)}%`;
    if (seed) $('#load-seed').textContent = `Seed: ${seed}`;
  }

  // ---------- transient messages ----------
  toast(text, dur = 3) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), dur * 1000);
  }
  pickup(id, qty) {
    const t = document.createElement('div');
    t.className = 'pick';
    t.innerHTML = `${esc(itemName(id))} <b>×${qty}</b>`;
    this.el.pickups.appendChild(t);
    while (this.el.pickups.children.length > 5) this.el.pickups.firstChild.remove();
    setTimeout(() => t.remove(), 2600);
  }
  banner(small, big, gold = false) {
    const b = $('#banner');
    b.hidden = true;
    b.classList.toggle('gold', gold);
    $('small', b).textContent = small;
    $('strong', b).textContent = big;
    void b.offsetWidth;
    b.hidden = false;
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => { b.hidden = true; }, 4300);
  }
  read(title, text) {
    $('#reader-title').textContent = title;
    $('#reader-text').textContent = text;
    this.open('reader');
  }
  fade(on) {
    $('#fade').classList.toggle('on', on);
  }

  // ---------- HUD ----------
  updateHUD(dt) {
    const g = this.game;
    const p = g.player;
    const s = g.state.player;
    const hpF = clamp(s.hp / p.maxHp, 0, 1);
    this.hpLag = hpF > this.hpLag ? hpF : Math.max(hpF, this.hpLag - dt * 0.25);
    this.el.hp.style.transform = `scaleX(${hpF})`;
    this.el.hpLag.style.transform = `scaleX(${this.hpLag})`;
    this.el.st.style.transform = `scaleX(${clamp(s.stamina / p.maxStamina, 0, 1)})`;
    this.el.dr.style.transform = `scaleX(${clamp(s.dread / 100, 0, 1)})`;
    const bars = $('#bars');
    bars.style.width = `min(40vw, ${Math.round(200 + (p.maxHp - 100) * 0.6)}px)`;
    this.el.embers.textContent = fmtInt(s.embers);
    this.el.clock.textContent = `${g.sky.clockString()} · ${g.sky.weatherLabel}`;
    this.el.flaskN.textContent = s.flasks;
    this.el.bombN.textContent = g.state.inv.firebomb || 0;
    this.el.hurt.style.opacity = String(Math.max(g.hurtPulse, s.hp / p.maxHp < 0.25 ? 0.35 + Math.sin(performance.now() * 0.006) * 0.15 : 0));
    this.el.veil.style.opacity = String(clamp((s.dread - 45) / 55, 0, 1) * 0.9);

    // Interact prompt
    const it = g.nearInteract;
    if (it && !p.dead) {
      this.el.prompt.hidden = false;
      this.el.promptText.textContent = g.interactLabel(it);
    } else this.el.prompt.hidden = true;

    // Boss
    const b = g.activeBoss;
    if (b && !b.dead) {
      this.el.boss.hidden = false;
      this.el.bossName.textContent = b.name;
      this.el.bossFill.style.transform = `scaleX(${clamp(b.hp / b.maxHp, 0, 1)})`;
    } else this.el.boss.hidden = true;

    this._compass();
    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.12; this._minimap(); this._objective(); }
  }

  _compass() {
    const g = this.game;
    const yaw = g.cameraYaw;
    const heading = Math.atan2(Math.sin(yaw), -Math.cos(yaw));
    const fov = Math.PI * 0.9;
    const items = [];
    const dirs = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
    for (const [l, deg] of dirs) items.push({ label: l, b: (deg * Math.PI) / 180, cls: l.length > 1 ? 'minor' : '' });
    const p = g.player.pos;
    const addMarker = (x, z, label, cls) => items.push({ label, b: Math.atan2(x - p.x, -(z - p.z)), cls: `mk ${cls}` });
    const tgt = g.objectiveTarget();
    if (tgt) addMarker(tgt.x, tgt.z, '◆', 'beacon');
    const rem = g.state.remnant;
    if (rem) addMarker(rem.x, rem.z, '✚', 'remnant');
    for (const loc of g.gen.locations) {
      if (!g.state.discovered.has(loc.id)) continue;
      const d = dist2(p.x, p.z, loc.x, loc.z);
      if (d < 20 || d > 300) continue;
      addMarker(loc.x, loc.z, loc.type === 'shrine' ? '✦' : '•', 'loc');
    }
    let html = '';
    for (const it of items) {
      const off = angleWrap(it.b - heading);
      if (Math.abs(off) > fov / 2) continue;
      html += `<span class="${it.cls}" style="left:${50 + (off / fov) * 100}%">${it.label}</span>`;
    }
    this.el.strip.innerHTML = html;
  }

  _objective() {
    const g = this.game;
    const lit = g.state.beacons.size;
    const tgt = g.objectiveTarget();
    let txt = `Beacons lit ${lit} / ${WORLD.MAJOR_COUNT}`;
    if (tgt) {
      const d = dist2(g.player.pos.x, g.player.pos.z, tgt.x, tgt.z);
      txt += ` · ${tgt.bossDead ? 'Light' : 'Seek'} ${tgt.name} (${Math.round(d)} m)`;
    }
    if (g.state.remnant) txt += ' · Recover your embers';
    this.el.objective.textContent = txt;
  }

  setMapImage(imgData) {
    this.mapCanvas.getContext('2d').putImageData(imgData, 0, 0);
  }

  _drawFog() {
    if (!this.fogDirty) return;
    this.fogDirty = false;
    const ctx = this.fogCanvas.getContext('2d');
    const img = ctx.createImageData(FOG_N, FOG_N);
    const f = this.game.state.fog;
    for (let i = 0; i < f.length; i++) {
      img.data[i * 4] = 176; img.data[i * 4 + 1] = 162; img.data[i * 4 + 2] = 128;
      img.data[i * 4 + 3] = f[i] ? 0 : 200;
    }
    ctx.putImageData(img, 0, 0);
  }

  _minimap() {
    const g = this.game;
    const ctx = this.miniCtx;
    const W = this.el.mini.width;
    const p = g.player.pos;
    const cell = (WORLD.HALF * 2) / MAP_N;
    const scale = 2.6; // screen px per map px (1 map px = 8 m)
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1b1814';
    ctx.fillRect(0, 0, W, W);
    ctx.translate(W / 2, W / 2);
    const yaw = g.cameraYaw;
    const rot = -Math.PI / 2 - Math.atan2(Math.cos(yaw), Math.sin(yaw));
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    const mx = (p.x + WORLD.HALF) / cell, mz = (p.z + WORLD.HALF) / cell;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapCanvas, -mx, -mz);
    this._drawFog();
    ctx.drawImage(this.fogCanvas, -mx, -mz, MAP_N, MAP_N);
    // markers
    for (const loc of g.gen.locations) {
      const known = g.state.discovered.has(loc.id) || g.state.seen.has(loc.id);
      if (!known && loc.kind !== 'major') continue;
      const lx = (loc.x + WORLD.HALF) / cell - mx, lz = (loc.z + WORLD.HALF) / cell - mz;
      if (lx * lx + lz * lz > 900) continue;
      this._marker(ctx, lx, lz, loc, known, 1 / scale);
    }
    const rem = g.state.remnant;
    if (rem) {
      ctx.fillStyle = '#d98a8a';
      ctx.beginPath();
      ctx.arc((rem.x + WORLD.HALF) / cell - mx, (rem.z + WORLD.HALF) / cell - mz, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // player arrow (always pointing up = camera forward), facing indicator
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(rot + Math.PI - g.player.facing);
    ctx.fillStyle = '#e0803c';
    ctx.strokeStyle = '#120f0c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 7); ctx.lineTo(5, -5); ctx.lineTo(0, -2); ctx.lineTo(-5, -5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // north tick
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(rot);
    ctx.fillStyle = '#d6caad';
    ctx.font = '12px serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -W / 2 + 14);
    ctx.restore();
  }

  _marker(ctx, x, z, loc, known, px) {
    const g = this.game;
    ctx.save();
    ctx.translate(x, z);
    ctx.scale(px * 2.6, px * 2.6);
    const lit = g.state.beacons.has(loc.id);
    if (loc.kind === 'major') {
      ctx.fillStyle = lit ? '#e0803c' : known ? '#3a2a1e' : 'rgba(58,42,30,.55)';
      ctx.strokeStyle = '#120f0c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      if (!known) { ctx.fillStyle = '#d6caad'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', 0, 3); }
    } else if (loc.type === 'shrine') {
      ctx.fillStyle = g.state.shrine === loc.id ? '#e0803c' : '#f0d8a0';
      ctx.strokeStyle = '#120f0c';
      ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(-2, -2, 4, 4);
    }
    ctx.restore();
  }

  // ---------- pause menu ----------
  menuTab(tab) {
    this.currentTab = tab;
    for (const b of $$('#menu [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    const body = $('#tab-body');
    body.scrollTop = 0;
    if (tab === 'gear') this.renderGear(body);
    else if (tab === 'char') this.renderChar(body);
    else if (tab === 'craft') this.renderCraft(body, this.game.nearFire());
    else if (tab === 'map') this.renderMap(body);
    else if (tab === 'journal') this.renderJournal(body);
    else if (tab === 'settings') this.renderSettings(body);
  }

  renderGear(body) {
    const g = this.game;
    const st = g.state;
    const groups = [['weapon', 'Weapons'], ['armor', 'Armour'], ['charm', 'Charms'], ['consumable', 'Supplies'], ['throwable', 'Supplies'], ['material', 'Materials']];
    const ids = Object.keys(st.inv).filter((id) => st.inv[id] > 0 && ITEMS[id]);
    const eq = st.equip;
    let list = '';
    let lastLabel = '';
    for (const [type, label] of groups) {
      const items = ids.filter((id) => ITEMS[id].type === type);
      if (!items.length) continue;
      if (label !== lastLabel) list += `<div class="inv-group">${label}</div>`;
      lastLabel = label;
      for (const id of items) {
        const equipped = eq.weapon === id || eq.armor === id || eq.charm === id;
        list += `<button class="inv-item${equipped ? ' equipped' : ''}" data-id="${id}"><span>${esc(itemName(id, type === 'weapon' ? st.weaponLvl[id] || 0 : 0))}</span>${ITEMS[id].type === 'weapon' || ITEMS[id].type === 'armor' || ITEMS[id].type === 'charm' ? '' : `<span class="q">×${st.inv[id]}</span>`}</button>`;
      }
    }
    const slot = (label, id) => `<div class="slot"><span>${label}</span><span>${id ? esc(itemName(id, label === 'Weapon' ? st.weaponLvl[id] || 0 : 0)) : '—'}</span></div>`;
    body.innerHTML = `<div class="gear-layout"><div><div class="slots">${slot('Weapon', eq.weapon)}${slot('Armour', eq.armor)}${slot('Charm', eq.charm)}</div><div class="inv-list">${list}</div></div><div class="detail" id="gear-detail"><p class="fine">Select an item to see it.</p></div></div>`;
    for (const b of $$('.inv-item', body)) {
      b.addEventListener('click', () => { $$('.inv-item', body).forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); this._gearDetail(b.dataset.id); });
      b.addEventListener('focus', () => this._gearDetail(b.dataset.id));
    }
  }

  _gearDetail(id) {
    const g = this.game;
    const st = g.state;
    const d = ITEMS[id];
    const el = $('#gear-detail');
    if (!d || !el) return;
    let stats = '';
    let action = '';
    if (d.type === 'weapon') {
      const lvl = st.weaponLvl[id] || 0;
      stats = `<dl class="stats"><dt>Damage</dt><dd>${Math.round(d.dmg * (1 + lvl * 0.14))}</dd><dt>Speed</dt><dd>${d.speed.toFixed(2)}</dd><dt>Reach</dt><dd>${d.reach.toFixed(1)} m</dd><dt>Stamina</dt><dd>${d.stamina}</dd><dt>Level</dt><dd>+${lvl}</dd></dl>`;
      action = st.equip.weapon === id ? '' : `<button class="mbtn slim primary" data-act="equip">Equip</button>`;
    } else if (d.type === 'armor') {
      stats = `<dl class="stats"><dt>Defence</dt><dd>${d.def}</dd><dt>Roll weight</dt><dd>${Math.round((d.weight || 0) * 100)}%</dd></dl>`;
      action = st.equip.armor === id ? '' : `<button class="mbtn slim primary" data-act="equip">Wear</button>`;
    } else if (d.type === 'charm') {
      action = st.equip.charm === id ? `<button class="mbtn slim ghost" data-act="unequip">Remove</button>` : `<button class="mbtn slim primary" data-act="equip">Wear</button>`;
    } else if (d.type === 'consumable') {
      action = `<button class="mbtn slim primary" data-act="use">Use</button>`;
    }
    el.innerHTML = `<h3>${esc(itemName(id, d.type === 'weapon' ? st.weaponLvl[id] || 0 : 0))}</h3>${d.relic ? '<div class="tag-relic">Relic</div>' : ''}<p class="fine">${esc(d.desc || '')}</p>${stats}<div class="row">${action}</div>`;
    const btn = $('[data-act]', el);
    if (btn) btn.addEventListener('click', () => {
      g.audio.play('ui');
      if (btn.dataset.act === 'equip') g.equip(id);
      else if (btn.dataset.act === 'unequip') g.equip(null, 'charm');
      else if (btn.dataset.act === 'use') g.useItem(id);
      this.renderGear($('#tab-body'));
      const again = $(`.inv-item[data-id="${id}"]`);
      if (again) { again.classList.add('sel'); this._gearDetail(id); } else this._gearDetail(id);
    });
  }

  renderChar(body) {
    const g = this.game;
    const s = g.state.player;
    const p = g.player;
    const st = g.state.stats;
    const hours = Math.floor(st.playTime / 3600), mins = Math.floor((st.playTime % 3600) / 60);
    body.innerHTML = `<div class="gear-layout"><div>
      <h3>Level ${s.level}</h3>
      <dl class="kv" style="margin-top:8px">
        <dt>Health</dt><dd>${Math.ceil(s.hp)} / ${p.maxHp}</dd>
        <dt>Stamina</dt><dd>${p.maxStamina}</dd>
        <dt>Damage</dt><dd>${Math.round(p.weapon.dmg * p.damageMul)}</dd>
        <dt>Defence</dt><dd>${p.armor.def}</dd>
        <dt>Flasks</dt><dd>${s.flasks} / ${s.flaskMax}</dd>
        <dt>Torch fuel</dt><dd>${Math.round(s.torchFuel)} s</dd>
        <dt>Embers</dt><dd>${fmtInt(s.embers)}</dd>
      </dl></div><div>
      <h3>Attributes</h3>
      <dl class="kv" style="margin-top:8px">${Object.entries(STAT_INFO).map(([k, [n]]) => `<dt>${n}</dt><dd>${s.stats[k]}</dd>`).join('')}</dl>
      <p class="fine" style="margin-top:12px">Raise attributes by resting at a shrine.</p>
      <h3 style="margin-top:14px">Record</h3>
      <dl class="kv" style="margin-top:8px"><dt>Seed</dt><dd>${esc(g.state.seed)}</dd><dt>Foes felled</dt><dd>${st.kills}</dd><dt>Guardians</dt><dd>${st.bossKills} / ${WORLD.MAJOR_COUNT}</dd><dt>Deaths</dt><dd>${st.deaths}</dd><dt>Time</dt><dd>${hours}h ${mins}m</dd><dt>Places found</dt><dd>${g.state.discovered.size} / ${g.gen.locations.length}</dd></dl>
      </div></div>`;
  }

  renderCraft(body, atFire) {
    const g = this.game;
    const inv = g.state.inv;
    if (!atFire) {
      body.innerHTML = `<p class="fine">You need a fire to craft. Sit by a camp fire or rest at a shrine.</p>${this._recipeList(false)}`;
    } else body.innerHTML = this._recipeList(true);
    for (const b of $$('[data-craft]', body)) {
      b.addEventListener('click', () => {
        g.craft(RECIPES[+b.dataset.craft]);
        this.renderCraft(body, atFire);
      });
    }
    void inv;
  }

  _recipeList(enabled) {
    const g = this.game;
    const inv = g.state.inv;
    return `<div class="list">${RECIPES.map((r, i) => {
      if (r.once && g.state.crafted.has(r.out)) return '';
      const needs = Object.entries(r.needs).map(([id, n]) => `<span class="${(inv[id] || 0) >= n ? '' : 'miss'}">${esc(ITEMS[id].name)} ${inv[id] || 0}/${n}</span>`).join(' · ');
      const can = enabled && Object.entries(r.needs).every(([id, n]) => (inv[id] || 0) >= n);
      return `<div class="recipe"><strong>${esc(ITEMS[r.out].name)}${r.qty > 1 ? ` ×${r.qty}` : ''}</strong><button class="mbtn slim${can ? ' primary' : ''}" data-craft="${i}" ${can ? '' : 'disabled'}>Craft</button><div class="needs">${needs}</div></div>`;
    }).join('')}</div>`;
  }

  renderMap(body) {
    body.innerHTML = `<div class="map-wrap"><canvas id="bigmap" width="512" height="512"></canvas></div><div class="map-legend"><span>◆ Guardian ruin</span><span>● Shrine</span><span>■ Other place</span><span style="color:#e0803c">▲ You</span></div>`;
    const canvas = $('#bigmap');
    this.drawBigMap(canvas);
    // Tap a marker to name it
    canvas.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const g = this.game;
      const r = canvas.getBoundingClientRect();
      const wx = ((e.clientX - r.left) / r.width) * WORLD.HALF * 2 - WORLD.HALF;
      const wz = ((e.clientY - r.top) / r.height) * WORLD.HALF * 2 - WORLD.HALF;
      let best = null, bd = 60;
      for (const loc of g.gen.locations) {
        const known = g.state.discovered.has(loc.id) || g.state.seen.has(loc.id);
        if (!known && loc.kind !== 'major') continue;
        const d = dist2(wx, wz, loc.x, loc.z);
        if (d < bd) { bd = d; best = loc; }
      }
      if (!best) return;
      const known = g.state.discovered.has(best.id) || g.state.seen.has(best.id);
      const d = Math.round(dist2(g.player.pos.x, g.player.pos.z, best.x, best.z));
      const status = best.kind === 'major' ? (g.state.beacons.has(best.id) ? ' · beacon lit' : g.state.bosses.has(best.id) ? ' · guardian slain' : '') : '';
      this.toast(`${known ? best.name : `Unknown ${TYPE_LABEL[best.type].toLowerCase()}`}${known ? ` (${TYPE_LABEL[best.type]})` : ''} · ${d} m away${status}`, 3.5);
    });
  }

  drawBigMap(canvas, opts = {}) {
    const g = this.game;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const k = W / MAP_N;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapCanvas, 0, 0, W, W);
    this._drawFog();
    ctx.drawImage(this.fogCanvas, 0, 0, W, W);
    // paper grain + frame
    ctx.strokeStyle = 'rgba(40,28,18,.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, W - 3);
    const cell = (WORLD.HALF * 2) / MAP_N;
    const toX = (x) => ((x + WORLD.HALF) / cell) * k;
    for (const loc of g.gen.locations) {
      const known = g.state.discovered.has(loc.id) || g.state.seen.has(loc.id);
      if (!known && loc.kind !== 'major') continue;
      const x = toX(loc.x), y = toX(loc.z);
      ctx.save();
      ctx.translate(x, y);
      this._marker(ctx, 0, 0, loc, known, 0.55);
      ctx.restore();
      if (known && (loc.kind === 'major' || loc.type === 'shrine' || opts.labels)) {
        ctx.font = loc.kind === 'major' ? '13px "IM Fell English SC", serif' : '11px "Alegreya Sans", sans-serif';
        ctx.fillStyle = '#20170f';
        ctx.textAlign = 'center';
        ctx.fillText(loc.name.replace(/^The /, ''), x, y - 10);
      }
    }
    const rem = g.state.remnant;
    if (rem) { ctx.fillStyle = '#9a2a22'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✚', toX(rem.x), toX(rem.z) + 5); }
    const p = g.player.pos;
    ctx.save();
    ctx.translate(toX(p.x), toX(p.z));
    ctx.rotate(Math.PI - g.player.facing);
    ctx.fillStyle = '#e0803c';
    ctx.strokeStyle = '#120f0c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 9); ctx.lineTo(6, -6); ctx.lineTo(0, -3); ctx.lineTo(-6, -6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // compass rose
    ctx.fillStyle = '#20170f';
    ctx.font = '16px "IM Fell English SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', W - 24, 26);
    ctx.beginPath(); ctx.moveTo(W - 24, 30); ctx.lineTo(W - 24, 48); ctx.strokeStyle = '#20170f'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  renderJournal(body) {
    const g = this.game;
    const st = g.state;
    const majors = g.gen.locations.filter((l) => l.kind === 'major');
    let html = `<div class="journal"><h4>The beacons</h4><p>Six guardians keep six ruins. Fell each, then light its beacon.</p>`;
    for (const m of majors) {
      const known = st.discovered.has(m.id) || st.seen.has(m.id);
      const lit = st.beacons.has(m.id), dead = st.bosses.has(m.id);
      html += `<p class="${lit ? 'done' : ''}">${lit ? '✓ ' : ''}${known ? esc(m.name) : `An unknown ${TYPE_LABEL[m.type].toLowerCase()}`} · ${lit ? 'Beacon burning' : dead ? `${esc(m.bossName.split(',')[0])} is dead. Light the beacon.` : known ? `Guarded by ${esc(m.bossName)}` : 'Unexplored'}</p>`;
    }
    const b = BIOMES[g.gen.biomeAt(g.player.pos.x, g.player.pos.z)];
    html += `<h4>Surroundings</h4><p>${esc(b ? b.name : '')}, danger ${g.gen.dangerAt(g.player.pos.x, g.player.pos.z)} of 7. ${g.sky.isNight ? 'Night. Wraiths walk.' : 'Day.'}</p>`;
    const notes = [...st.notes];
    html += `<h4>Notes found (${notes.length})</h4>`;
    if (!notes.length) html += '<p class="fine">Read notes left at ruins and stones. They collect here.</p>';
    for (const id of notes.reverse()) {
      const n = st.noteTexts[id];
      if (n) html += `<p class="note">${esc(n.text)}<br><small>${esc(n.place)}</small></p>`;
    }
    body.innerHTML = `${html}</div>`;
  }

  renderSettings(body) {
    const g = this.game;
    const s = g.settings;
    const q = s.quality || g.autoQuality;
    body.innerHTML = `
      <div class="set-row"><span>Graphics</span><div class="seg" id="set-q">${Object.keys(QUALITY).map((k) => `<button data-q="${k}" aria-pressed="${q === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
      <div class="set-row"><label for="set-sens">Look sensitivity</label><input id="set-sens" type="range" min="0.3" max="2.5" step="0.1" value="${s.sensitivity}"></div>
      <div class="set-row"><span>Invert look</span><div class="seg" id="set-inv"><button data-v="0" aria-pressed="${!s.invertY}">Off</button><button data-v="1" aria-pressed="${s.invertY}">On</button></div></div>
      <div class="set-row"><label for="set-vol">Sound</label><input id="set-vol" type="range" min="0" max="1" step="0.05" value="${s.volume}"></div>
      <div class="set-row"><label for="set-mus">Music</label><input id="set-mus" type="range" min="0" max="1" step="0.05" value="${s.music}"></div>
      <div class="set-row"><span>Vibration</span><div class="seg" id="set-vib"><button data-v="1" aria-pressed="${s.vibration}">On</button><button data-v="0" aria-pressed="${!s.vibration}">Off</button></div></div>
      <div class="set-row"><span>Button side</span><div class="seg" id="set-lefty"><button data-v="0" aria-pressed="${!s.lefty}">Right</button><button data-v="1" aria-pressed="${!!s.lefty}">Left</button></div></div>
      <div class="set-row"><span>Screen shake</span><div class="seg" id="set-shake"><button data-v="1" aria-pressed="${s.shake}">On</button><button data-v="0" aria-pressed="${!s.shake}">Off</button></div></div>
      <div class="set-row"><span>Frame counter</span><div class="seg" id="set-fps"><button data-v="1" aria-pressed="${s.showFps}">On</button><button data-v="0" aria-pressed="${!s.showFps}">Off</button></div></div>
      <p class="fine" style="margin-top:12px">Low graphics shortens the view distance and thins vegetation. Use it if your phone runs hot.</p>`;
    const seg = (id, fn) => $$(`#${id} button`, body).forEach((b) => b.addEventListener('click', () => {
      $$(`#${id} button`, body).forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      fn(b);
      g.applySettings();
    }));
    seg('set-q', (b) => { s.quality = b.dataset.q; });
    seg('set-inv', (b) => { s.invertY = b.dataset.v === '1'; });
    seg('set-vib', (b) => { s.vibration = b.dataset.v === '1'; });
    seg('set-fps', (b) => { s.showFps = b.dataset.v === '1'; });
    seg('set-lefty', (b) => { s.lefty = b.dataset.v === '1'; });
    seg('set-shake', (b) => { s.shake = b.dataset.v === '1'; });
    $('#set-sens', body).addEventListener('input', (e) => { s.sensitivity = +e.target.value; g.applySettings(); });
    $('#set-vol', body).addEventListener('input', (e) => { s.volume = +e.target.value; g.applySettings(); });
    $('#set-mus', body).addEventListener('input', (e) => { s.music = +e.target.value; g.applySettings(); });
  }

  // ---------- shrine ----------
  openShrine(loc) {
    $('#shrine-name').textContent = loc.name;
    this.shrineLoc = loc;
    this.open('shrine');
    this.shrineTab('level');
  }

  shrineTab(tab) {
    for (const b of $$('#shrine [data-stab]')) b.setAttribute('aria-selected', String(b.dataset.stab === tab));
    const body = $('#shrine-body');
    body.scrollTop = 0;
    if (tab === 'level') this.renderLevel(body);
    else if (tab === 'travel') this.renderTravel(body);
    else if (tab === 'craft') this.renderCraft(body, true);
    else if (tab === 'forge') this.renderForge(body);
  }

  renderLevel(body) {
    const g = this.game;
    const s = g.state.player;
    const cost = g.levelCost();
    const can = s.embers >= cost;
    body.innerHTML = `<p>Level ${s.level}. Next level costs <strong style="color:var(--ember)">${fmtInt(cost)}</strong> embers. You carry ${fmtInt(s.embers)}.</p>
      <div class="stat-rows">${Object.entries(STAT_INFO).map(([k, [n, d]]) => `<div class="stat-row"><div>${n}<small>${d}</small></div><span class="v">${s.stats[k]}</span><button class="plus" data-stat="${k}" aria-label="Raise ${n}" ${can ? '' : 'disabled'}>+</button></div>`).join('')}</div>
      <p class="fine" style="margin-top:12px">Your flask holds ${s.flaskMax} draughts${s.flaskLvl ? `, strengthened +${s.flaskLvl}` : ''}. Every two beacons lit adds another.</p>`;
    for (const b of $$('[data-stat]', body)) b.addEventListener('click', () => { g.levelUp(b.dataset.stat); this.renderLevel(body); const again = $(`[data-stat="${b.dataset.stat}"]`, body); if (again && !again.disabled) again.focus(); });
  }

  renderTravel(body) {
    const g = this.game;
    const shrines = g.gen.locations.filter((l) => l.type === 'shrine' && g.state.discovered.has(l.id));
    const here = this.shrineLoc;
    body.innerHTML = `<p class="fine">Walk the ember-roads between shrines you have found.</p><div class="list">${shrines.map((l) => {
      const d = dist2(here.x, here.z, l.x, l.z);
      return `<div class="recipe"><strong>${esc(l.name)}</strong><button class="mbtn slim${l.id === here.id ? '' : ' primary'}" data-travel="${l.id}" ${l.id === here.id ? 'disabled' : ''}>${l.id === here.id ? 'Here' : 'Travel'}</button><div class="needs">${l.id === here.id ? 'You are here' : `${Math.round(d)} m away`}</div></div>`;
    }).join('')}</div>`;
    for (const b of $$('[data-travel]', body)) b.addEventListener('click', () => g.travelTo(+b.dataset.travel));
  }

  renderForge(body) {
    const g = this.game;
    const st = g.state;
    const weapons = Object.keys(st.inv).filter((id) => st.inv[id] > 0 && ITEMS[id] && ITEMS[id].type === 'weapon');
    body.innerHTML = `<p class="fine">Temper a weapon with iron scrap. Past +2, it needs ember shards too. Each level adds 14% damage.</p><div class="list">${weapons.map((id) => {
      const lvl = st.weaponLvl[id] || 0;
      if (lvl >= 5) return `<div class="recipe"><strong>${esc(itemName(id, lvl))}</strong><button class="mbtn slim" disabled>Max</button><div class="needs">Fully tempered</div></div>`;
      const cost = upgradeCost(lvl);
      const can = Object.entries(cost).every(([k, n]) => (st.inv[k] || 0) >= n);
      const needs = Object.entries(cost).map(([k, n]) => `<span class="${(st.inv[k] || 0) >= n ? '' : 'miss'}">${esc(ITEMS[k].name)} ${st.inv[k] || 0}/${n}</span>`).join(' · ');
      return `<div class="recipe"><strong>${esc(itemName(id, lvl))} → +${lvl + 1}</strong><button class="mbtn slim${can ? ' primary' : ''}" data-forge="${id}" ${can ? '' : 'disabled'}>Temper</button><div class="needs">${needs}</div></div>`;
    }).join('')}</div>`;
    for (const b of $$('[data-forge]', body)) b.addEventListener('click', () => { g.upgradeWeapon(b.dataset.forge); this.renderForge(body); });
  }

  // ---------- merchant ----------
  openTrade() {
    this.open('trade');
    this.renderTrade();
  }

  renderTrade() {
    const g = this.game;
    const st = g.state;
    const body = $('#trade-body');
    const embers = st.player.embers;
    const bought = st.bought || (st.bought = {});
    let html = `<p>You carry <span class="price">${fmtInt(embers)}</span> embers.</p><div class="list">`;
    MERCHANT.forEach((w, i) => {
      if (w.once && (bought[w.id] || st.inv[w.id])) return;
      const price = w.special ? w.price * (1 + (bought.flask || 0)) : w.price;
      const name = w.special ? w.name : ITEMS[w.id].name;
      const desc = w.special ? w.desc : ITEMS[w.id].desc;
      const owned = w.special ? `Flask holds ${st.player.flaskMax}` : `You have ${st.inv[w.id] || 0}`;
      const can = embers >= price;
      html += `<div class="recipe"><strong>${esc(name)} <span class="price">${fmtInt(price)}</span></strong><button class="mbtn slim${can ? ' primary' : ''}" data-buy="${i}" ${can ? '' : 'disabled'}>Buy</button><div class="needs">${esc(desc)} ${owned}.</div></div>`;
    });
    body.innerHTML = `${html}</div>`;
    for (const b of $$('[data-buy]', body)) b.addEventListener('click', () => { g.buy(MERCHANT[+b.dataset.buy]); this.renderTrade(); });
  }

  // Lock-on marker over the targeted enemy
  updateReticle(camera) {
    const el = $('#reticle');
    const t = this.game.lockTarget;
    if (!t || t.dead || this.game.mode !== 'play') { el.hidden = true; return; }
    const v = t.pos.clone();
    v.y += 0.6 * t.scale;
    v.project(camera);
    if (v.z > 1) { el.hidden = true; return; }
    el.hidden = false;
    el.style.transform = `translate(${(v.x * 0.5 + 0.5) * window.innerWidth}px, ${(-v.y * 0.5 + 0.5) * window.innerHeight}px)`;
  }

  // ---------- controller / keyboard navigation for menus ----------
  navigate(input) {
    const id = this.top();
    if (!id) return;
    const root = document.getElementById(id);
    if (!root) return;
    const focusables = $$('button:not([disabled]):not([hidden]), input', root).filter((e) => e.offsetParent !== null);
    if (!focusables.length) return;
    const cur = focusables.indexOf(document.activeElement);
    const move = (d) => {
      const n = cur < 0 ? 0 : (cur + d + focusables.length) % focusables.length;
      focusables[n].focus();
      focusables[n].scrollIntoView({ block: 'nearest' });
    };
    if (input.consume('down_d') || input.consume('right_d')) move(1);
    if (input.consume('up_d') || input.consume('left_d')) move(-1);
    // gamepad stick as d-pad with repeat
    const now = performance.now();
    if (input.gamepad.active && Math.abs(input.move.y) > 0.6 && now - (this._navT || 0) > 220) {
      this._navT = now;
      move(input.move.y < 0 ? 1 : -1);
    }
    if (input.gamepad.active && input.consume('jump') && document.activeElement && focusables.includes(document.activeElement)) document.activeElement.click();
    if (input.consume('dodge') || input.consume('menu')) this.game.back();
  }
}
