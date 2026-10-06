# Tray Packing Management Dashboard

The Node server hosts a read-only management dashboard at:

`http://192.168.40.29:3168/admin`

It reads only from `registered_parts` and `inspection_results`. Users can filter by a Malaysia-local date range (up to 366 days) and part number, and review OK/NG totals and yield, daily counts, totals by machine and part, up to 50 recent runs, and all matching inspection records. The inspection-results list becomes vertically scrollable when it contains more than 10 rows. Database timestamps remain UTC; the dashboard converts them to `Asia/Kuala_Lumpur` for date filtering and display. The dashboard does not poll automatically; use Refresh to request updated data.

## Access and network security

The dashboard and its read-only data API do not require a login. Anyone who can reach the Node server can view inspection totals, machine/part breakdowns, recent runs, and recent inspection records. The dashboard is served over plain HTTP, so keep the server bound to a trusted private network and restrict port `3168` with the host/network firewall. Do not expose it directly to the internet. Use authentication and HTTPS if access outside the trusted network is ever needed.

## Deploy

Deploy `server.js`, `admin_dashboard.html`, `admin_dashboard.js`, and `admin_dashboard_utils.js` together, then restart the Node server. Apply `migrations/004_inspection_dashboard_time_index.sql` once to the `tray` database to add an index for date-filtered reports. It adds an index only and does not alter or delete inspection rows. Take the usual database backup and run the migration during a quiet period.

Hover over a daily chart row or bar to see that date's OK, NG, and total counts. The date-range utility tests can be run from this repository with:

```powershell
node admin_dashboard_utils.test.js
```
