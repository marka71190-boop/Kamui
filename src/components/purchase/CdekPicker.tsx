"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cdekCountry, type CdekCountryCode } from "@/config/cdek-countries";
import { formatMoney, formatPrice, plural } from "@/lib/format";
import { LIMITS } from "@/lib/orders/validation";
import dynamic from "next/dynamic";
import styles from "./Cdek.module.css";
import type { MapPoint } from "./PointsMap";

// Карта (Leaflet) подгружается только когда покупатель открыл вкладку «На карте»
const PointsMap = dynamic(() => import("./PointsMap").then((m) => m.PointsMap), {
  ssr: false,
  loading: () => <p className={styles.muted}>Загружаем карту…</p>,
});

export interface CdekSelection {
  city: string;
  cityCode: number;
  pickupPoint: string;
}

export interface CdekQuoteView {
  /** Для покупателя, ₽ */
  cost: number;
  periodMin: number;
  periodMax: number;
  /** Для покупателя из-за рубежа (оплата через Robokassa), $ */
  usd?: number;
}

export type QuoteState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; quote: CdekQuoteView }
  | { state: "error" };

interface City {
  code: number;
  name: string;
}

interface Point {
  code: string;
  name: string;
  address: string;
  workTime?: string;
  lat?: number;
  lon?: number;
}

interface Geo {
  lat: number;
  lon: number;
}

const MAX_VISIBLE = 60;

/** Расстояние по прямой, км */
function distanceKm(a: Geo, b: Geo): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const distanceText = (km: number) => (km < 1 ? `${Math.max(50, Math.round(km * 20) * 50)} м` : `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} км`);

const hasCoords = (p: Point): p is Point & Geo => typeof p.lat === "number" && typeof p.lon === "number";

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function periodText(q: CdekQuoteView) {
  if (!q.periodMin && !q.periodMax) return "";
  const max = q.periodMax || q.periodMin;
  const range = q.periodMin && q.periodMin !== max ? `${q.periodMin}–${max}` : String(max);
  return `${range} ${plural(max, ["день", "дня", "дней"])}`;
}

export function CdekPicker({
  country = "RU",
  value,
  quantity,
  product = "chalk",
  freeDelivery,
  cityError,
  pointError,
  onChange,
  onQuote,
}: {
  /** Страна доставки: города ищутся только в ней */
  country?: CdekCountryCode;
  value: CdekSelection;
  quantity: number;
  /** Мел или подарочный набор — у набора другая посылка */
  product?: "chalk" | "kit";
  freeDelivery: boolean;
  cityError?: string;
  pointError?: string;
  onChange: (next: CdekSelection) => void;
  onQuote: (q: QuoteState) => void;
}) {
  const uid = useId();
  const listId = `${uid}-cities`;

  /* ── город ── */
  const [cities, setCities] = useState<City[]>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityFail, setCityFail] = useState("");
  const [active, setActive] = useState(-1);
  const cityTimer = useRef<number | undefined>(undefined);
  const cityReq = useRef(0);

  const searchCities = (q: string) => {
    window.clearTimeout(cityTimer.current);
    setCityFail("");
    if (q.trim().length < 2) {
      setCities([]);
      setCityOpen(false);
      return;
    }
    setCityLoading(true);
    const req = ++cityReq.current;
    cityTimer.current = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: q.trim() });
        if (country !== "RU") params.set("country", country);
        const data = await getJson<{ cities: City[] }>(`/api/delivery/cdek/cities?${params}`);
        if (req !== cityReq.current) return;
        setCities(data.cities);
        setActive(data.cities.length ? 0 : -1);
        setCityOpen(true);
      } catch {
        if (req !== cityReq.current) return;
        setCities([]);
        setCityFail("Не удалось загрузить города СДЭК. Попробуйте ещё раз.");
      } finally {
        if (req === cityReq.current) setCityLoading(false);
      }
    }, 280);
  };

  const pickCity = (c: City) => {
    cityReq.current++;
    window.clearTimeout(cityTimer.current);
    setCityLoading(false);
    setCityOpen(false);
    setCities([]);
    justPicked.current = true;
    onChange({ city: c.name, cityCode: c.code, pickupPoint: "" });
  };

  const onCityKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!cityOpen || cities.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % cities.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? cities.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (active >= 0) {
        e.preventDefault();
        pickCity(cities[active]);
      }
    } else if (e.key === "Escape") {
      setCityOpen(false);
    }
  };

  /* ── пункты выдачи ── */
  const [points, setPoints] = useState<Point[] | null>(null);
  const [pointsState, setPointsState] = useState<"idle" | "loading" | "error">("idle");
  const [pointQuery, setPointQuery] = useState("");
  const [listOpen, setListOpen] = useState(true);
  const [reload, setReload] = useState(0);
  /** Список или карта */
  const [view, setView] = useState<"list" | "map">("list");
  /** Пункт, на который нажали на карте (ещё не выбран) */
  const [preview, setPreview] = useState("");
  /** «Рядом со мной»: где покупатель */
  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "loading" | "denied">("idle");
  const searchRef = useRef<HTMLInputElement>(null);
  /** Город только что выбран из списка — после загрузки пунктов ставим курсор в поиск */
  const justPicked = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const locate = () => {
    if (geo) return setGeo(null);
    if (!("geolocation" in navigator)) return setGeoState("denied");
    setGeoState("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGeoState("idle");
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  useEffect(() => {
    setPoints(null);
    setPointQuery("");
    setListOpen(true);
    setPreview("");
    if (!value.cityCode) {
      setPointsState("idle");
      return;
    }
    const ctrl = new AbortController();
    setPointsState("loading");
    getJson<{ points: Point[] }>(`/api/delivery/cdek/points?cityCode=${value.cityCode}`, { signal: ctrl.signal })
      .then((d) => {
        setPoints(d.points);
        setPointsState("idle");
        // Пункт уже выбран (форма восстановлена из черновика) — показываем его, а не весь список
        if (d.points.some((p) => p.code === valueRef.current.pickupPoint)) setListOpen(false);
        else if (justPicked.current) window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 60);
        justPicked.current = false;
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) {
          console.warn(err);
          setPointsState("error");
        }
      });
    return () => ctrl.abort();
  }, [value.cityCode, reload]);

  const filtered = useMemo(() => {
    if (!points) return [];
    const q = norm(pointQuery.trim());
    const list: (Point & { km?: number })[] = q ? points.filter((p) => norm(`${p.address} ${p.name} ${p.code}`).includes(q)) : points;
    if (!geo) return list;
    // «Рядом со мной»: ближайшие — сверху
    return list
      .map((p) => ({ ...p, km: hasCoords(p) ? distanceKm(geo, p) : undefined }))
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
  }, [points, pointQuery, geo]);

  const mapPoints = useMemo<MapPoint[]>(
    () => filtered.filter(hasCoords).map((p) => ({ code: p.code, address: p.address, lat: p.lat, lon: p.lon })),
    [filtered],
  );
  const canMap = (points ?? []).some(hasCoords);
  const previewPoint = points?.find((p) => p.code === preview);

  const selected = points?.find((p) => p.code === value.pickupPoint);

  /* ── расчёт доставки ── */
  const [quote, setQuote] = useState<QuoteState>({ state: "idle" });
  const onQuoteRef = useRef(onQuote);
  onQuoteRef.current = onQuote;

  useEffect(() => {
    if (!value.cityCode) {
      setQuote({ state: "idle" });
      onQuoteRef.current({ state: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setQuote({ state: "loading" });
    onQuoteRef.current({ state: "loading" });
    const t = window.setTimeout(() => {
      getJson<{ quote: CdekQuoteView }>("/api/delivery/cdek/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityCode: value.cityCode, quantity, country, product }),
        signal: ctrl.signal,
      })
        .then((d) => {
          const q: QuoteState = { state: "ready", quote: d.quote };
          setQuote(q);
          onQuoteRef.current(q);
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          setQuote({ state: "error" });
          onQuoteRef.current({ state: "error" });
        });
    }, 200);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [value.cityCode, quantity, country, product]);

  const showSearch = (points?.length ?? 0) > 6;
  const visible = filtered.slice(0, MAX_VISIBLE);

  return (
    <div className={styles.box}>
      <p className={styles.head}>
        <span>Доставка СДЭК</span>
        <span className={styles.headNote}>
          {country === "RU" ? "до пункта выдачи" : `до пункта выдачи · ${cdekCountry(country).name}`}
        </span>
      </p>

      {/* Город */}
      <div className={styles.field} data-invalid={cityError ? "" : undefined}>
        <label htmlFor="city" className={styles.label}>
          Город<span className={styles.req} aria-hidden="true">*</span>
        </label>
        <div className={styles.combo}>
          <input
            id="city"
            name="city"
            data-field="city"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={cityOpen}
            aria-controls={listId}
            aria-activedescendant={cityOpen && active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={cityError ? true : undefined}
            aria-describedby={cityError ? "city-error" : undefined}
            autoComplete="off"
            maxLength={LIMITS.city}
            placeholder={`Начните вводить: ${cdekCountry(country).cityExample}`}
            value={value.city}
            onChange={(e) => {
              onChange({ city: e.target.value, cityCode: 0, pickupPoint: "" });
              searchCities(e.target.value);
            }}
            onKeyDown={onCityKey}
            onFocus={() => cities.length > 0 && !value.cityCode && setCityOpen(true)}
            onBlur={() => window.setTimeout(() => setCityOpen(false), 150)}
          />
          {cityLoading && <span className={styles.spinner} aria-hidden="true" />}
          {value.cityCode > 0 && !cityLoading && <span className={styles.okMark} aria-hidden="true" />}
          {cityOpen && (
            <ul id={listId} role="listbox" className={styles.options} aria-label="Города СДЭК">
              {cities.length === 0 ? (
                <li className={styles.optionEmpty}>Город не найден — проверьте написание</li>
              ) : (
                cities.map((c, i) => (
                  <li
                    key={c.code}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={styles.option}
                    data-active={i === active || undefined}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickCity(c);
                    }}
                    onMouseEnter={() => setActive(i)}
                  >
                    {c.name}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        {(cityError || cityFail) && (
          <p id="city-error" className={styles.error} role="alert">
            {cityError || cityFail}
          </p>
        )}
      </div>

      {/* Пункт выдачи */}
      {value.cityCode > 0 && (
        <div className={styles.field} data-invalid={pointError ? "" : undefined}>
          <p className={styles.label} id={`${uid}-pvz`}>
            Пункт выдачи<span className={styles.req} aria-hidden="true">*</span>
            {points && points.length > 0 && (
              <span className={styles.count}>
                {points.length} {plural(points.length, ["пункт", "пункта", "пунктов"])}
              </span>
            )}
          </p>

          {pointsState === "loading" && <p className={styles.muted}>Загружаем пункты выдачи…</p>}
          {pointsState === "error" && (
            <p className={styles.error} role="alert">
              Не удалось загрузить пункты выдачи.{" "}
              <button type="button" className={styles.textBtn} onClick={() => setReload((n) => n + 1)}>
                Повторить
              </button>
            </p>
          )}
          {points && points.length === 0 && (
            <p className={styles.muted}>
              В этом городе нет пунктов выдачи СДЭК. Выберите ближайший город или напишите пожелания в комментарии.
            </p>
          )}

          {selected && !listOpen ? (
            <div className={styles.chosen}>
              <div>
                <p className={styles.chosenAddr}>{selected.address}</p>
                {selected.workTime && <p className={styles.pointMeta}>{selected.workTime}</p>}
              </div>
              <button
                type="button"
                className={styles.textBtn}
                onClick={() => setListOpen(true)}
                data-field="pickupPoint"
              >
                Изменить
              </button>
            </div>
          ) : (
            points &&
            points.length > 0 && (
              <>
                {canMap && (
                  <div className={styles.tools}>
                    <div className={styles.tabs}>
                      <button type="button" className={styles.tab} aria-pressed={view === "list"} onClick={() => setView("list")}>
                        Списком
                      </button>
                      <button type="button" className={styles.tab} aria-pressed={view === "map"} onClick={() => setView("map")}>
                        На карте
                      </button>
                    </div>
                    <button type="button" className={styles.nearBtn} onClick={locate} disabled={geoState === "loading"} data-on={geo ? "" : undefined}>
                      {geoState === "loading" ? "Определяем…" : geo ? "✓ Ближайшие сверху" : "Рядом со мной"}
                    </button>
                    {geoState === "denied" && (
                      <span className={styles.muted}>Не удалось определить место — разрешите доступ к геопозиции в браузере.</span>
                    )}
                  </div>
                )}
                {showSearch && (
                  <input
                    ref={searchRef}
                    className={styles.search}
                    type="search"
                    placeholder="Поиск по улице или метро"
                    aria-label="Поиск пункта выдачи"
                    value={pointQuery}
                    onChange={(e) => setPointQuery(e.target.value)}
                    data-field={value.pickupPoint ? undefined : "pickupPoint"}
                    aria-invalid={pointError ? true : undefined}
                  />
                )}
                {view === "map" && canMap && (
                  <>
                    <PointsMap points={mapPoints} activeCode={preview || value.pickupPoint} user={geo} onPick={setPreview} />
                    {previewPoint ? (
                      <div className={styles.preview}>
                        <div>
                          <p className={styles.chosenAddr}>{previewPoint.address}</p>
                          {previewPoint.workTime && <p className={styles.pointMeta}>{previewPoint.workTime}</p>}
                        </div>
                        <button
                          type="button"
                          className={styles.pickBtn}
                          onClick={() => {
                            onChange({ ...value, pickupPoint: previewPoint.code });
                            setListOpen(false);
                            setPreview("");
                          }}
                        >
                          Заберу отсюда
                        </button>
                      </div>
                    ) : (
                      <p className={styles.muted}>Нажмите на точку на карте, чтобы посмотреть адрес и выбрать пункт.</p>
                    )}
                  </>
                )}
                <div
                  className={styles.points}
                  hidden={view === "map" && canMap}
                  role="radiogroup"
                  aria-labelledby={`${uid}-pvz`}
                  aria-describedby={pointError ? "pickupPoint-error" : undefined}
                >
                  {visible.map((p, i) => (
                    <label key={p.code} className={styles.point} data-checked={p.code === value.pickupPoint || undefined}>
                      <input
                        type="radio"
                        name="pickupPoint"
                        value={p.code}
                        checked={p.code === value.pickupPoint}
                        data-field={!showSearch && i === 0 ? "pickupPoint" : undefined}
                        onChange={() => {
                          onChange({ ...value, pickupPoint: p.code });
                          setListOpen(false);
                        }}
                      />
                      <span className={styles.radio} aria-hidden="true" />
                      <span className={styles.pointText}>
                        <span className={styles.pointAddr}>{p.address}</span>
                        {p.workTime && <span className={styles.pointMeta}>{p.workTime}</span>}
                      </span>
                      {p.km !== undefined && <span className={styles.dist}>{distanceText(p.km)}</span>}
                    </label>
                  ))}
                  {filtered.length === 0 && <p className={styles.muted}>Ничего не найдено — измените запрос</p>}
                  {filtered.length > MAX_VISIBLE && (
                    <p className={styles.muted}>
                      Показаны {MAX_VISIBLE} из {filtered.length}. Уточните улицу в поиске.
                    </p>
                  )}
                </div>
              </>
            )
          )}
          {pointError && (
            <p id="pickupPoint-error" className={styles.error} role="alert">
              {pointError}
            </p>
          )}
        </div>
      )}

      {/* Стоимость */}
      {value.cityCode > 0 && (
        <p className={styles.quote} aria-live="polite">
          {quote.state === "loading" && "Считаем стоимость доставки…"}
          {quote.state === "error" && "Не удалось рассчитать доставку — уточним стоимость после заявки."}
          {quote.state === "ready" && (
            <>
              <span>
                Доставка:{" "}
                <b>
                  {freeDelivery || quote.quote.cost === 0
                    ? "бесплатно"
                    : quote.quote.usd !== undefined
                      ? formatMoney(quote.quote.usd, "USD")
                      : formatPrice(quote.quote.cost)}
                </b>
              </span>
              {periodText(quote.quote) && <span className={styles.quoteDim}>в пути {periodText(quote.quote)}</span>}
            </>
          )}
        </p>
      )}
    </div>
  );
}
