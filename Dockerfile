# ── Kamui Collection — сборка сайта для Timeweb Cloud App Platform (Москва) ──
# Код сайта лежит в архиве kamui-site.tar.gz рядом с этим файлом.
# Секреты (ключи СДЭК, ЮKassa, Google Таблицы) сюда НЕ пишем — они задаются в панели Timeweb.

FROM node:22-alpine AS src
WORKDIR /src
COPY kamui-site.tar.gz ./
RUN mkdir app && tar -xzf kamui-site.tar.gz -C app

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone NEXT_PUBLIC_SITE_URL=https://kamui-collection.ru
COPY --from=src /src/app/ ./
RUN npm install --no-audit --no-fund && npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TZ=Europe/Moscow

# ── Настройки магазина (не секретные). Любую можно переопределить в панели Timeweb. ──
# Диск контейнера стирается при каждом обновлении — заявки хранятся в Google Таблице
ENV NEXT_PUBLIC_SITE_URL=https://kamui-collection.ru ORDERS_FILE_STORE=false
# СДЭК: отправка из Краснодара, ПВЗ ул. Зиповская, 37; посылка склад-склад; 1 шт. — 7×7×1 см, 23 г
ENV CDEK_ENABLED=true CDEK_TEST_MODE=false CDEK_FROM_CITY_CODE=435 CDEK_SHIPMENT_POINT=KSD47 CDEK_TARIFF_CODE=136 \
    CDEK_ITEM_WEIGHT_G=23 CDEK_ITEM_LENGTH_CM=7 CDEK_ITEM_WIDTH_CM=7 CDEK_ITEM_HEIGHT_CM=1 CDEK_AUTO_SHIPMENT=true
# Доставку оплачивает покупатель, +30% к тарифу СДЭК
ENV DELIVERY_PRICE_MODE=customer DELIVERY_MARKUP_PERCENT=30
# ЮKassa: онлайн-оплата (секретный ключ — в панели Timeweb)
ENV PAYMENTS_ENABLED=true YOOKASSA_SHOP_ID=1192659

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p /app/data && chown -R node:node /app/data /app/.next
USER node
EXPOSE 3000
CMD ["node", "server.js"]
