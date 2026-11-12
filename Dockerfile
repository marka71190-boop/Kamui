# ── Kamui Collection: production-образ (Next.js standalone) ──
# Подходит для Timeweb Cloud App Platform (деплой из GitHub по Dockerfile) и для любого VPS с Docker.
# Секреты (ключи СДЭК, ЮKassa, Google Таблицы) сюда НЕ пишем — они задаются в панели хостинга.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:22-alpine AS build
WORKDIR /app
# Ключи есть только при запуске, поэтому страницы с товаром собираются на каждый запрос (см. src/lib/render-mode.ts)
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone KAMUI_DYNAMIC_PAGES=1 \
    NEXT_PUBLIC_SITE_URL=https://kamui-collection.ru
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TZ=Europe/Moscow KAMUI_DYNAMIC_PAGES=1

# ── Настройки магазина (не секретные). Любую можно переопределить в панели хостинга. ──
# Диск контейнера стирается при каждом обновлении — заявки хранятся в Google Таблице
ENV NEXT_PUBLIC_SITE_URL=https://kamui-collection.ru ORDERS_FILE_STORE=false
# СДЭК: отправка из Краснодара, ПВЗ ул. Зиповская, 37; посылка склад-склад; 1 шт. — 26×18×1 см, 23 г
ENV CDEK_ENABLED=true CDEK_TEST_MODE=false CDEK_FROM_CITY_CODE=435 CDEK_SHIPMENT_POINT=KSD47 CDEK_TARIFF_CODE=136 \
    CDEK_ITEM_WEIGHT_G=23 CDEK_ITEM_LENGTH_CM=26 CDEK_ITEM_WIDTH_CM=18 CDEK_ITEM_HEIGHT_CM=1 CDEK_AUTO_SHIPMENT=true
# Доставку оплачивает покупатель, +30% к тарифу СДЭК
ENV DELIVERY_PRICE_MODE=customer DELIVERY_MARKUP_PERCENT=30
# ЮKassa: онлайн-оплата (секретный ключ — в панели хостинга)
ENV PAYMENTS_ENABLED=true YOOKASSA_SHOP_ID=1192659

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p /app/data && chown -R node:node /app/data /app/.next
USER node
EXPOSE 3000
CMD ["node", "server.js"]
