/**
 * Success URL Robokassa — покупатель оплатил и возвращается на сайт.
 * В личном кабинете Robokassa: Success URL https://kamui-collection.ru/api/payments/robokassa/success, метод GET.
 * Ведёт на страницу заказа, где сайт сам проверяет статус оплаты.
 */
import { orderReturnRedirect } from "../return";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = (request: Request) => orderReturnRedirect(request);
export const GET = handle;
export const POST = handle;
