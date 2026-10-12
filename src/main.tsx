import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fitsParcel } from './geometry.js';
import { simulate, kinds } from './simulation.js';
import { World, type Obj, type Parcel, offset } from './world';
import './style.css';
async function api(path: string, body?: unknown, method = 'POST') {
  const r = await fetch('/api' + path, {
    method: body ? method : 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || 'Request failed');
  return data;
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
class SceneBoundary extends React.Component<
  { children: React.ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
function Observation({
  objects,
  selected,
  select,
}: {
  objects: Obj[];
  selected: string | null;
  select: (s: string) => void;
}) {
  return (
    <section className="observation" aria-label="Lightweight settlement map">
      <div className="eyebrow">OBSERVATION MODE · YOUR PARCEL</div>
      <svg viewBox="-22 -22 44 44" role="img" aria-label="Top-down construction parcel">
        {Array.from({ length: 20 }, (_, i) => (
          <path
            key={i}
            d={`M ${i * 2 - 19},-19 V19 M -19,${i * 2 - 19} H19`}
            stroke="#284454"
            strokeWidth=".08"
          />
        ))}
        {objects.map((o) => (
          <g
            key={o.id}
            transform={`translate(${o.position[0]},${o.position[1]}) rotate(${(o.rotation * 180) / Math.PI}) scale(${o.scale})`}
            onClick={() => select(o.id)}
          >
            <title>
              {kinds[o.kind].label} {o.id}
            </title>
            <rect
              x="-1.2"
              y="-1.2"
              width="2.4"
              height="2.4"
              fill={o.id === selected ? '#d7bc83' : o.kind === 'solar' ? '#8fe8f5' : '#a8b4c2'}
              fillOpacity=".5"
              stroke="#8fe8f5"
              strokeWidth=".1"
            />
          </g>
        ))}
      </svg>
      <p>Use the component list and coordinate placement controls to build without WebGL.</p>
    </section>
  );
}
function App() {
  const [entered, setEntered] = useState(false),
    [name, setName] = useState('Guest'),
    [user, setUser] = useState<any>(null),
    [auth, setAuth] = useState(false),
    [password, setPassword] = useState(''),
    [register, setRegister] = useState(true),
    [recover, setRecover] = useState(false),
    [recoveryInput, setRecoveryInput] = useState(''),
    [recoveryCode, setRecoveryCode] = useState(''),
    [confirmDelete, setConfirmDelete] = useState(false),
    [deletePassword, setDeletePassword] = useState('');
  const [tab, setTab] = useState('Explore'),
    [objects, setObjects] = useState<Obj[]>([]),
    [parcel, setParcel] = useState<Parcel | null>(null),
    [parcels, setParcels] = useState<Parcel[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [tool, setTool] = useState<Obj['kind'] | null>(null),
    [structural, setStructural] = useState(false),
    [factor, setFactor] = useState(1),
    [policy, setPolicy] = useState('equal'),
    [quality, setQuality] = useState('standard'),
    [top, setTop] = useState(false),
    [observe, setObserve] = useState(false),
    [large, setLarge] = useState(false);
  const [message, setMessage] = useState(
      'Welcome to the Commons. Move with WASD. Drag to orbit; scroll to zoom.',
    ),
    [busy, setBusy] = useState(false),
    [peers, setPeers] = useState<any[]>([]),
    [connection, setConnection] = useState('Connecting'),
    [history, setHistory] = useState<Obj[][]>([]),
    [future, setFuture] = useState<Obj[][]>([]),
    [savedHistory, setSavedHistory] = useState<any[]>([]),
    [autoPaused, setAutoPaused] = useState(false),
    [tick, setTick] = useState(0),
    [verified, setVerified] = useState<any>(null),
    [x, setX] = useState(0),
    [z, setZ] = useState(0),
    [chat, setChat] = useState(''),
    [chats, setChats] = useState<any[]>([]),
    [blocked, setBlocked] = useState<string[]>([]),
    [reportSubject, setReportSubject] = useState(''),
    [reportReason, setReportReason] = useState('');
  const saveQueue = useRef<Promise<void>>(Promise.resolve()),
    parcelRef = useRef<Parcel | null>(parcel);
  parcelRef.current = parcel;
  const socket = useRef<WebSocket | null>(null),
    self = useRef(''),
    position = useRef([0, 24]),
    nameRef = useRef(name),
    userRef = useRef(user),
    build = tab === 'Create';
  nameRef.current = name;
  userRef.current = user;
  useEffect(() => {
    let live = true;
    api('/session')
      .then(async (d) => {
        if (!live) return;
        setUser(d.user);
        if (d.user) {
          setName(d.user.name);
          const p = await api('/parcels', {});
          if (live) load(p.parcel, false);
        }
      })
      .catch((e) => setMessage(e.message));
    api('/world')
      .then((d) => {
        if (live) {
          setParcels(d.parcels);
          setTick(d.tick);
        }
      })
      .catch((e) => setMessage(e.message));
    try {
      const local = JSON.parse(localStorage.getItem('athens-guest-draft') || 'null');
      if (local?.objects) {
        setObjects(local.objects);
        setPolicy(local.policy);
      }
    } catch {}
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    function connect() {
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/room`,
      );
      socket.current = ws;
      ws.onopen = () => {
        setConnection('Shared room · online');
        ws.send(
          JSON.stringify({ type: 'move', position: position.current, name: nameRef.current }),
        );
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'welcome') self.current = m.id;
        if (m.type === 'presence')
          setPeers(m.participants.filter((p: any) => p.id !== self.current));
        if (m.type === 'world') {
          setParcels(m.parcels);
          setTick(m.tick);
        }
        if (m.type === 'tick') setTick(m.tick);
        if (m.type === 'error') setMessage(m.message);
        if (m.type === 'chat') setChats((c) => [...c.slice(-49), m]);
      };
      ws.onerror = () => setConnection('Room unavailable');
      ws.onclose = () => {
        if (stopped) return;
        setConnection('Reconnecting…');
        if (!stopped) timer = setTimeout(connect, 2000);
      };
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket.current?.close();
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user)
      try {
        localStorage.setItem('athens-guest-draft', JSON.stringify({ objects, policy }));
      } catch {
        setMessage('Browser storage is unavailable. Export your draft before leaving.');
      }
  }, [objects, policy, user]);
  useEffect(() => {
    if (
      !parcel ||
      !user ||
      busy ||
      autoPaused ||
      (JSON.stringify(objects) === JSON.stringify(parcel.objects) && policy === parcel.policy)
    )
      return;
    let active = true;
    const timer = setTimeout(() => {
      save()
        .then(() => {
          if (active) setMessage('Autosaved settlement.');
        })
        .catch((e) => {
          setAutoPaused(true);
          setMessage(e.message);
        });
    }, 1800);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [objects, policy, parcel, busy, autoPaused, user]);
  useEffect(() => {
    let active = true;
    setVerified(null);
    const timer = setTimeout(() => {
      api('/scenarios', { objects, factor, policy })
        .then((d) => {
          if (active) setVerified(d);
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [objects, factor, policy]);
  useEffect(() => {
    if (!auth && !recoveryCode && !reportSubject && !confirmDelete) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = [...document.querySelectorAll<HTMLElement>('.modal')].pop();
    const nodes = () => [
      ...(dialog?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input, textarea, select, a[href]',
      ) || []),
    ];
    (dialog?.querySelector<HTMLElement>('[autofocus]') || nodes()[0])?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAuth(false);
        setRecoveryCode('');
        setReportSubject('');
        setConfirmDelete(false);
        setDeletePassword('');
      }
      if (e.key === 'Tab') {
        const elements = nodes(),
          first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      if (previous?.isConnected) previous.focus();
    };
  }, [auth, recoveryCode, reportSubject, confirmDelete]);
  const picked = objects.find((o) => o.id === selected),
    base = simulate(objects, 1, policy),
    scenario = simulate(objects, factor, policy),
    visiblePeers = peers.filter((p) => !blocked.includes(p.id));
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function change(next: Obj[]) {
    setHistory((h) => [...h.slice(-29), objects]);
    setFuture([]);
    setObjects(next);
  }
  function edit(patch: Partial<Obj>) {
    if (!picked) return;
    const next = { ...picked, ...patch };
    if (!fitsParcel(next)) {
      setMessage(
        'The complete object must fit inside its parcel. Move it inward before rotating or resizing.',
      );
      return;
    }
    change(objects.map((o) => (o.id === picked.id ? next : o)));
  }
  function place(px: number, pz: number) {
    if (!tool) return;
    if (!Number.isFinite(px) || !Number.isFinite(pz) || Math.abs(px) > 18 || Math.abs(pz) > 18) {
      setMessage('Place objects inside the parcel: coordinates −18 to 18.');
      return;
    }
    if (objects.length >= 80) {
      setMessage('Parcel limit: 80 objects.');
      return;
    }
    const o: Obj = {
      id: crypto.randomUUID(),
      kind: tool,
      position: [Math.round(px / 2) * 2, Math.round(pz / 2) * 2],
      rotation: 0,
      scale: 1,
      connected: tool === 'solar',
    };
    if (!fitsParcel(o)) {
      setMessage('Place this component farther from the parcel boundary.');
      return;
    }
    change([...objects, o]);
    setSelected(o.id);
    setTool(null);
  }
  function load(p: Parcel, open = true) {
    setParcel(p);
    setObjects(p.objects);
    setPolicy(p.policy);
    setHistory([]);
    setFuture([]);
    setSelected(null);
    setAutoPaused(false);
    if (open) setTab('Create');
    setMessage('Your saved parcel is loaded. Slot ' + p.slot + '.');
  }
  function save(published?: boolean): Promise<void> {
    if (!user) {
      setAuth(true);
      return Promise.resolve();
    }
    const expectedUser = user.id;
    const snapshot = { objects: structuredClone(objects), policy };
    const operation = async () => {
      if (userRef.current?.id !== expectedUser) return;
      let p = parcelRef.current;
      if (!p) {
        p = (await api('/parcels', {})).parcel;
        if (
          p!.objects.length &&
          !confirm(
            'Replace the contents of your saved parcel with this draft? Export either creation first if you want to keep both.',
          )
        )
          return;
      }
      const d = await api(
        '/parcels/' + p!.id,
        { ...snapshot, revision: p!.revision, published: published ?? p!.published },
        'PUT',
      );
      if (userRef.current?.id !== expectedUser) return;
      parcelRef.current = d.parcel;
      setParcel(d.parcel);
      setAutoPaused(false);
      if (published !== undefined)
        setMessage(
          published
            ? 'Published to the shared landscape. Only you can edit it.'
            : 'Settlement saved.',
        );
    };
    const result = saveQueue.current.then(operation);
    saveQueue.current = result.catch(() => {});
    return result;
  }
  const move = (p: number[]) => {
    position.current = p;
    if (socket.current?.readyState === 1)
      socket.current.send(JSON.stringify({ type: 'move', position: p, name }));
  };
  async function authenticate() {
    const d = await api(
      recover ? '/recover' : '/auth',
      recover ? { name, password, recoveryCode: recoveryInput } : { name, password, register },
    );
    setUser(d.user);
    setName(d.user.name);
    setPassword('');
    setAuth(false);
    if (d.recoveryCode) setRecoveryCode(d.recoveryCode);
    const p = (await api('/parcels', {})).parcel;
    if (p.objects.length) load(p);
    else {
      setParcel(p);
      setAutoPaused(false);
      setMessage('Your parcel is claimed. Your current draft will autosave.');
    }
    localStorage.removeItem('athens-guest-draft');
  }
  return (
    <main className={large ? 'large-text' : ''}>
      <div className="scene">
        {observe ? (
          <Observation objects={objects} selected={selected} select={setSelected} />
        ) : (
          <SceneBoundary
            onFailure={() => {
              setObserve(true);
              setMessage(
                'WebGL is unavailable. Observation mode provides map and keyboard building controls.',
              );
            }}
          >
            <React.Suspense
              fallback={
                <div className="render-error" role="status">
                  Loading the world…
                </div>
              }
            >
              <World
                objects={objects}
                select={setSelected}
                selected={selected}
                structural={structural}
                build={build}
                tool={tool}
                place={place}
                peers={visiblePeers}
                move={move}
                top={top}
                quality={quality}
                factor={factor}
                policy={policy}
                parcels={parcels}
                activeSlot={parcel?.slot ?? -1}
                enabled={entered && !auth && !recoveryCode}
              />
            </React.Suspense>
          </SceneBoundary>
        )}
      </div>
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setEntered(false);
          }}
        >
          <span className="mark">Λ</span>
          <span>
            VIRTUAL ATHENS<small>OPHANIM TECHNOLOGIES</small>
          </span>
        </a>
        <div className="room">
          <span className="dot" />
          {connection}
          <span className="population">{peers.length + 1} present</span>
        </div>
        <button onClick={() => (user ? setTab('Self') : setAuth(true))}>
          {user ? user.name : 'Guest · Sign in'} ↗
        </button>
      </header>
      {!entered ? (
        <section className="landing">
          <div className="eyebrow">A WORLD OF POSSIBLE WORLDS</div>
          <h1>
            The future is
            <br />
            yours to construct.
          </h1>
          <p>
            An inhabitable experiment in civilisation.
            <br />
            Explore, build, and discover how a world works.
          </p>
          {!user && (
            <label className="guest-name">
              Explorer name
              <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <button className="primary" onClick={() => setEntered(true)}>
            Enter Athens <span>↗</span>
          </button>
          <div className="entry-note">Free to explore. No account required.</div>
          <button className="text-button" onClick={() => setObserve(!observe)}>
            {observe ? 'Use 3D world' : 'Use lightweight observation mode'}
          </button>
        </section>
      ) : (
        <>
          <nav aria-label="World functions">
            {['Explore', 'Create', 'World', 'Society', 'Self'].map((t) => (
              <button
                aria-current={tab === t ? 'page' : undefined}
                className={tab === t ? 'active' : ''}
                key={t}
                onClick={() => {
                  setTab(t);
                  setTool(null);
                }}
              >
                {t}
              </button>
            ))}
          </nav>
          <section className="context">
            <div className="eyebrow">
              {build ? 'YOUR FIRST SETTLEMENT' : 'THE COMMONS / PUBLIC REALM'}
            </div>
            <h1>
              {build
                ? 'Make a possible world.'
                : tab === 'World'
                  ? 'Understand the system.'
                  : tab === 'Society'
                    ? 'A shared beginning.'
                    : tab === 'Self'
                      ? 'Your place in Athens.'
                      : 'A civilisation, open to you.'}
            </h1>
            <p>
              {build
                ? 'Place a residence, add energy, and connect the system.'
                : 'Seven districts. One living experiment. Your decisions become part of the world.'}
            </p>
          </section>
          <aside className="panel" aria-label={tab + ' tools'}>
            <div className="panel-title">
              {tab === 'Create'
                ? 'SETTLEMENT WORKSHOP'
                : tab === 'World'
                  ? 'WORLD SYSTEMS'
                  : tab === 'Society'
                    ? 'SHARED INSTANCE'
                    : tab === 'Self'
                      ? 'IDENTITY & PROPERTY'
                      : 'BEGIN YOUR EXPLORATION'}
              <span>01</span>
            </div>
            {tab === 'Explore' && (
              <>
                <h2>From observer to creator.</h2>
                <p>
                  WASD or arrow keys to walk. Drag to orbit your view and scroll to zoom. Buildings
                  block movement. Gold marks your avatar.
                </p>
                <div className="steps">
                  <span>01 / Explore the Commons</span>
                  <span>02 / Build on your illuminated parcel</span>
                  <span>03 / Connect energy and a simulated resident</span>
                  <span>04 / Try a shortage, revise, save and publish</span>
                </div>
                <button className="primary" onClick={() => setTab('Create')}>
                  Create a settlement ↗
                </button>
                <p className="muted">
                  Guest drafts are stored in this browser. Sign in to claim a persistent parcel.
                </p>
              </>
            )}
            {build && (
              <>
                <div className="chips">
                  {Object.entries(kinds).map(([k, v]) => (
                    <button
                      key={k}
                      className={tool === k ? 'chosen' : ''}
                      aria-pressed={tool === k}
                      onClick={() => setTool(tool === k ? null : (k as Obj['kind']))}
                    >
                      {v.label}
                      <small>{v.supply ? `+${v.supply}` : `−${v.demand}`} energy / interval</small>
                    </button>
                  ))}
                </div>
                <p className="muted">
                  {tool
                    ? 'Click the parcel grid or use coordinates. Snapping: 2 units.'
                    : 'Choose a component or select one in the world or list.'}
                </p>
                {tool && (
                  <div className="coordinate-tools">
                    <label>
                      Placement X
                      <input
                        type="number"
                        min="-18"
                        max="18"
                        step="2"
                        value={x}
                        onChange={(e) => setX(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      Placement Z
                      <input
                        type="number"
                        min="-18"
                        max="18"
                        step="2"
                        value={z}
                        onChange={(e) => setZ(Number(e.target.value))}
                      />
                    </label>
                    <button onClick={() => place(x, z)}>Place component</button>
                  </div>
                )}
                <div className="button-row">
                  <button
                    disabled={!history.length}
                    onClick={() => {
                      setFuture((f) => [objects, ...f]);
                      setObjects(history[history.length - 1]);
                      setHistory((h) => h.slice(0, -1));
                    }}
                  >
                    Undo
                  </button>
                  <button
                    disabled={!future.length}
                    onClick={() => {
                      setHistory((h) => [...h, objects]);
                      setObjects(future[0]);
                      setFuture((f) => f.slice(1));
                    }}
                  >
                    Redo
                  </button>
                </div>
                {picked && (
                  <div className="inspector">
                    <h3>{kinds[picked.kind].label}</h3>
                    <small>
                      ID {picked.id.slice(0, 8)} · {parcel ? `Owner: ${user?.name}` : 'Guest draft'}
                      <br />
                      Rights: view, modify, duplicate, delete {parcel ? '· save, publish' : ''}
                    </small>
                    <div className="button-row">
                      <button onClick={() => edit({ rotation: picked.rotation + Math.PI / 4 })}>
                        Rotate 45°
                      </button>
                      <button onClick={() => change(objects.filter((o) => o.id !== picked.id))}>
                        Delete
                      </button>
                    </div>
                    <button
                      className="wide"
                      disabled={objects.length >= 80}
                      onClick={() => {
                        const o = {
                          ...picked,
                          id: crypto.randomUUID(),
                          position: [Math.min(18, picked.position[0] + 2), picked.position[1]],
                        };
                        if (!fitsParcel(o)) {
                          setMessage('Move the object inward before duplicating.');
                          return;
                        }
                        change([...objects, o]);
                        setSelected(o.id);
                      }}
                    >
                      Duplicate
                    </button>
                    <label>
                      Scale
                      <input
                        type="range"
                        min=".5"
                        max="2"
                        step=".1"
                        value={picked.scale}
                        onChange={(e) => edit({ scale: Number(e.target.value) })}
                      />
                    </label>
                    <div className="button-row">
                      {[
                        ['←', -2, 0],
                        ['→', 2, 0],
                        ['↑', 0, -2],
                        ['↓', 0, 2],
                      ].map(([l, dx, dz]) => (
                        <button
                          aria-label={`Move ${l}`}
                          key={l}
                          onClick={() =>
                            edit({
                              position: [
                                Math.max(-18, Math.min(18, picked.position[0] + Number(dx))),
                                Math.max(-18, Math.min(18, picked.position[1] + Number(dz))),
                              ],
                            })
                          }
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    {picked.kind !== 'solar' && (
                      <label>
                        <input
                          type="checkbox"
                          checked={picked.connected}
                          onChange={(e) => edit({ connected: e.target.checked })}
                        />{' '}
                        Connect to settlement energy bus
                      </label>
                    )}
                    {picked.kind === 'resident' && (
                      <p>
                        Simulated character: wanders when powered, waits when constrained.
                        Deterministic behavior, not a human participant.
                      </p>
                    )}
                  </div>
                )}
                <label>
                  Allocation rule
                  <select value={policy} onChange={(e) => setPolicy(e.target.value)}>
                    <option value="equal">Proportional to demand</option>
                    <option value="priority">Construction order priority</option>
                  </select>
                </label>
                <div className="button-row">
                  <button disabled={busy} onClick={() => action(() => save(false))}>
                    Save draft
                  </button>
                  <button
                    disabled={busy || !objects.length}
                    onClick={() => action(() => save(true))}
                  >
                    Publish ↗
                  </button>
                </div>
                <p className="muted">
                  {parcel
                    ? autoPaused
                      ? 'Autosave paused. Reload your parcel to reconcile.'
                      : 'Owned parcel · autosaves after edits · revision ' + parcel.revision
                    : 'Local draft · sign in to save'}
                </p>
              </>
            )}
            {(tab === 'World' || build) && (
              <>
                <div className="metrics">
                  <div>
                    <strong>{scenario.supply.toFixed(1)}</strong>
                    <small>ENERGY SUPPLY</small>
                  </div>
                  <div>
                    <strong>{scenario.demand}</strong>
                    <small>CONNECTED DEMAND</small>
                  </div>
                </div>
                <button
                  className={structural ? 'chosen wide' : 'wide'}
                  aria-pressed={structural}
                  onClick={() => setStructural(!structural)}
                >
                  Structural Vision {structural ? 'ON' : 'OFF'} ◇
                </button>
                <label>
                  Scenario · energy availability {Math.round(factor * 100)}%
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step=".1"
                    value={factor}
                    onChange={(e) => setFactor(Number(e.target.value))}
                  />
                </label>
                <div className="comparison">
                  <span>Baseline / scenario</span>
                  <strong>
                    {base.used.toFixed(1)} → {scenario.used.toFixed(1)} energy delivered
                  </strong>
                  <p>
                    Connected consumers share the energy bus. Supply equals delivered plus surplus.
                    The scenario does not change your saved world.
                  </p>
                  <small>
                    {verified
                      ? `Server evaluated · model ${verified.modelVersion} · seed ${verified.seed}`
                      : 'Evaluating scenario…'}{' '}
                    · world tick {tick}
                  </small>
                </div>
                <h3>World inspector · {objects.length} components</h3>
                {scenario.objects.map((o: any) => (
                  <button
                    className="object-row"
                    key={o.id}
                    aria-pressed={selected === o.id}
                    onClick={() => setSelected(o.id)}
                  >
                    {kinds[o.kind as Obj['kind']].label}
                    <span>
                      {o.kind === 'solar' ? '+12' : `${o.delivered.toFixed(1)}/${o.need}`} ·{' '}
                      {o.status}
                    </span>
                  </button>
                ))}
                {tab === 'World' && picked && (
                  <div className="inspector">
                    <h3>{kinds[picked.kind].label}</h3>
                    <p>
                      ID {picked.id}
                      <br />
                      Owner: {parcel ? user?.name : 'Local draft'}
                      <br />
                      Position: {picked.position.join(', ')}
                      <br />
                      Dependency: {picked.connected ? 'settlement energy bus' : 'not connected'}
                    </p>
                  </div>
                )}
              </>
            )}
            {tab === 'Society' && (
              <>
                <h2>{peers.length + 1} explorers in this room</h2>
                <p>
                  Published settlements occupy distinct parcels in the shared landscape. Ownership
                  protects your creations.
                </p>
                {peers.map((p) => (
                  <div key={p.id} className="participant">
                    <span>
                      {p.name} · {p.account ? 'resident' : 'guest'}
                    </span>
                    <button
                      onClick={() =>
                        setBlocked((b) =>
                          b.includes(p.id) ? b.filter((id) => id !== p.id) : [...b, p.id],
                        )
                      }
                    >
                      {blocked.includes(p.id) ? 'Unblock' : 'Block'}
                    </button>
                    <button onClick={() => setReportSubject(p.id)}>Report</button>
                  </div>
                ))}
                <div className="chat-log" role="log" aria-label="Room chat">
                  {chats
                    .filter((c) => !blocked.includes(c.id))
                    .map((c, i) => (
                      <p key={i}>
                        <strong>{c.name}</strong> {c.text}
                      </p>
                    ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (socket.current?.readyState !== 1) {
                      setMessage('Chat unavailable while reconnecting.');
                      return;
                    }
                    socket.current.send(JSON.stringify({ type: 'chat', text: chat }));
                    setChat('');
                  }}
                >
                  <label>
                    Room message
                    <input maxLength={300} value={chat} onChange={(e) => setChat(e.target.value)} />
                  </label>
                  <button disabled={!chat.trim()}>Send message</button>
                </form>
                <h3>Published settlements</h3>
                {parcels.map((p) => (
                  <button
                    className="object-row"
                    key={p.id}
                    onClick={() => {
                      if (
                        objects.length &&
                        !confirm(
                          'Inspect this settlement as a local copy? Your saved parcel is preserved; export any unsaved draft first.',
                        )
                      )
                        return;
                      setObjects(p.objects.map((o) => ({ ...o, id: crypto.randomUUID() })));
                      setPolicy(p.policy);
                      setParcel(null);
                      setTab('World');
                      setMessage(
                        `Inspecting ${p.ownerName}'s creation. This is a local copy; you cannot modify their stored parcel.`,
                      );
                    }}
                  >
                    {p.ownerName}
                    <span>
                      Parcel {p.slot} · {p.objects.length} components
                    </span>
                  </button>
                ))}
                {!parcels.length && <p className="muted">No published settlements yet.</p>}
                <p className="muted">
                  Reports are stored for operator review. Blocks hide presence and chat in this
                  session.
                </p>
              </>
            )}
            {tab === 'Self' && (
              <>
                <h2>{user?.name || 'Guest explorer'}</h2>
                <p>
                  {user
                    ? 'Your persistent parcel is protected by server-enforced ownership.'
                    : 'Explore and build freely. An account is required to save and publish.'}
                </p>
                <button
                  className="wide"
                  onClick={() =>
                    action(async () => {
                      if (!user) {
                        setAuth(true);
                        return;
                      }
                      if (
                        parcel &&
                        JSON.stringify(objects) !== JSON.stringify(parcel.objects) &&
                        !confirm('Load the saved version and discard unsaved changes?')
                      )
                        return;
                      await saveQueue.current;
                      load((await api('/parcels', {})).parcel);
                    })
                  }
                >
                  {user ? 'Load / claim my parcel' : 'Create an account'}
                </button>
                <button
                  className="wide"
                  onClick={() =>
                    download({ modelVersion: 1, objects, policy }, 'athens-settlement.json')
                  }
                >
                  Export creation JSON ↓
                </button>
                <label>
                  Text size
                  <select
                    value={large ? 'large' : 'normal'}
                    onChange={(e) => setLarge(e.target.value === 'large')}
                  >
                    <option value="normal">Standard</option>
                    <option value="large">Large</option>
                  </select>
                </label>
                <button className="wide" onClick={() => setObserve(!observe)}>
                  {observe ? 'Use 3D world' : 'Use lightweight observation mode'}
                </button>
                {user && (
                  <>
                    <button
                      className="wide"
                      onClick={() =>
                        action(async () => download(await api('/export'), 'athens-account.json'))
                      }
                    >
                      Export account data
                    </button>
                    <button
                      className="wide"
                      onClick={() =>
                        action(async () => {
                          if (!parcel) {
                            setMessage('Load your parcel before opening its history.');
                            return;
                          }
                          setSavedHistory(
                            (await api('/parcels/' + parcel.id + '/history')).history,
                          );
                        })
                      }
                    >
                      View recoverable history
                    </button>
                    {savedHistory.map((h) => (
                      <button
                        className="object-row"
                        key={h.revision}
                        disabled={busy || !parcel || h.revision === parcel.revision}
                        onClick={() =>
                          action(async () => {
                            if (
                              confirm(
                                'Restore revision ' +
                                  h.revision +
                                  '? A new revision will preserve your current snapshot.',
                              )
                            )
                              load(
                                (
                                  await api('/parcels/' + parcel!.id + '/restore', {
                                    revision: parcel!.revision,
                                    targetRevision: h.revision,
                                  })
                                ).parcel,
                              );
                          })
                        }
                      >
                        Revision {h.revision}
                        <span>{h.action} · Restore</span>
                      </button>
                    ))}
                    <button
                      className="wide"
                      onClick={() =>
                        action(async () => {
                          await saveQueue.current;
                          await api('/logout', {});
                          setUser(null);
                          setParcel(null);
                          setObjects([]);
                          setName('Guest');
                          setMessage('Signed out. Saved creations remain on the server.');
                        })
                      }
                    >
                      Sign out
                    </button>
                    <button className="wide" onClick={() => setConfirmDelete(true)}>
                      Delete account
                    </button>
                  </>
                )}
                <p className="muted">
                  No research telemetry is collected. Published creations and room activity are
                  visible to visitors. Private drafts and account data remain private; export or
                  delete them here.
                </p>
              </>
            )}
          </aside>
          <footer>
            <span role="status">
              {busy ? 'Saving… ' : ''}
              {message}
            </span>
            <div>
              <button onClick={() => setTop(!top)}>{top ? 'Orbit view' : 'Planning view'} ↗</button>
              <select
                aria-label="Graphics quality"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              >
                <option value="standard">Standard graphics</option>
                <option value="low">Low graphics</option>
              </select>
            </div>
          </footer>
        </>
      )}
      {auth && (
        <div className="modal-backdrop">
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Resident account"
            onSubmit={(e) => {
              e.preventDefault();
              action(authenticate);
            }}
          >
            <button
              type="button"
              className="close"
              aria-label="Close account form"
              onClick={() => setAuth(false)}
            >
              ×
            </button>
            <div className="eyebrow">YOUR PLACE IN THE WORLD</div>
            <h2>
              {recover
                ? 'Recover your account.'
                : register
                  ? 'Become a resident.'
                  : 'Welcome back.'}
            </h2>
            <p>Accounts preserve your creations. Guest exploration is always free.</p>
            <label>
              Display name
              <input
                autoFocus
                autoComplete="username"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={3}
                maxLength={24}
              />
            </label>
            {recover && (
              <label>
                Recovery code
                <input
                  value={recoveryInput}
                  onChange={(e) => setRecoveryInput(e.target.value)}
                  required
                />
              </label>
            )}
            <label>
              Password
              <input
                autoComplete={register || recover ? 'new-password' : 'current-password'}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
                maxLength={128}
              />
            </label>
            <button disabled={busy} className="primary">
              {busy
                ? 'Please wait…'
                : recover
                  ? 'Reset password'
                  : register
                    ? 'Create account'
                    : 'Sign in'}{' '}
              ↗
            </button>
            <button
              type="button"
              onClick={() => {
                setRecover(false);
                setRegister(!register);
              }}
            >
              {register ? 'Already a resident? Sign in' : 'New here? Create an account'}
            </button>
            <button type="button" onClick={() => setRecover(!recover)}>
              {recover ? 'Back to sign in' : 'Use a recovery code'}
            </button>
            <p role="status">{message}</p>
          </form>
        </div>
      )}
      {recoveryCode && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Save recovery code"
          >
            <h2>Keep your recovery code.</h2>
            <p>This code can reset your password. Store it privately; it is shown only now.</p>
            <code className="recovery-code">{recoveryCode}</code>
            <button
              className="primary"
              onClick={() => download({ account: name, recoveryCode }, 'athens-recovery.json')}
            >
              Download recovery code
            </button>
            <button autoFocus onClick={() => setRecoveryCode('')}>
              I have stored my code
            </button>
          </section>
        </div>
      )}
      {confirmDelete && (
        <div className="modal-backdrop">
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete account"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                await api('/account/delete', { password: deletePassword });
                setUser(null);
                setParcel(null);
                setObjects([]);
                setName('Guest');
                setConfirmDelete(false);
                setDeletePassword('');
                setMessage('Account and associated private creations deleted.');
              });
            }}
          >
            <h2>Delete your account?</h2>
            <p>
              This permanently deletes your parcel, snapshots, sessions and account. Export your
              work first.
            </p>
            <label>
              Confirm password
              <input
                autoFocus
                type="password"
                autoComplete="current-password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </label>
            <button disabled={busy}>Permanently delete account</button>
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false);
                setDeletePassword('');
              }}
            >
              Cancel
            </button>
            <p role="status">{message}</p>
          </form>
        </div>
      )}
      {reportSubject && (
        <div className="modal-backdrop">
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Report participant"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                if (!user) {
                  setReportSubject('');
                  setAuth(true);
                  setMessage('Sign in to submit a report.');
                  return;
                }
                await api('/reports', { subject: reportSubject, reason: reportReason });
                setReportSubject('');
                setReportReason('');
                setMessage('Report submitted for operator review.');
              });
            }}
          >
            <h2>Report participant</h2>
            <label>
              Reason
              <textarea
                value={reportReason}
                minLength={5}
                maxLength={1000}
                onChange={(e) => setReportReason(e.target.value)}
                required
              />
            </label>
            <button disabled={busy}>Submit report</button>
            <button type="button" onClick={() => setReportSubject('')}>
              Cancel
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
