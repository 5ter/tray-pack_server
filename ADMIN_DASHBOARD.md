# Tray Packing Management Dashboard

The Node server hosts a read-only management dashboard at:

`http://192.168.40.29:3168/admin`

It reads only from `registered_parts` and `inspection_results`. Management users can filter by a Malaysia-local date range (up to 366 days) and part number, and review OK/NG totals and yield, daily counts, totals by machine and part, up to 50 recent runs, and up to 100 recent inspection records. Database timestamps remain UTC; the dashboard converts them to `Asia/Kuala_Lumpur` for date filtering and display. The dashboard does not poll automatically; use Refresh to request updated data.

## Access

Sign in with an account from the existing `user_log_in` table. The current schema has no roles/permissions column, so every account that authenticates against this table can access the dashboard. The server issues an in-memory bearer session that expires after eight hours and is revoked when the server restarts or the user signs out. Dashboard data APIs require this token.

The server currently uses plain HTTP. Keep access on a trusted private network or VPN; use TLS before making the dashboard reachable from an untrusted network. Existing passwords are checked using the current table's password format; this dashboard does not change password storage.

## Deploy

Deploy `server.js`, `admin_dashboard.html`, `admin_dashboard.js`, and `admin_dashboard_utils.js` together, then restart the Node server. Apply `migrations/004_inspection_dashboard_time_index.sql` once to the `tray` database to add an index for date-filtered reports. It adds an index only and does not alter or delete inspection rows. Take the usual database backup and run the migration during a quiet period.

The date-range utility tests can be run from this repository with:

```powershell
node admin_dashboard_utils.test.js
```
