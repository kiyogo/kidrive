# Ma trận Kết nối API: Flutter Web Client ↔ Next.js Web Client

Bảng đối chiếu toàn bộ các API endpoint và phương thức gọi giữa Flutter Web Client (`files_db.dart`, `share_db.dart`, `auth_db.dart`) và Next.js Web Client (`api.ts`, `endpoints.ts`).

| Nhóm chức năng | Endpoint | Phương thức | Flutter Service | Next.js Wrapper | Trạng thái Parity |
|---|---|---|---|---|---|
| **Auth** | `/api/auth/token` | POST | `auth_db.dart:signIn` | `api.post(Api.token)` | VERIFIED |
| **Auth** | `/api/auth/refresh` | POST | `auth_db.dart:refresh` | `api.post(Api.refresh)` | VERIFIED |
| **Auth** | `/api/auth/setup` | POST | `auth_db.dart:setup` | `api.post(Api.setup)` | VERIFIED |
| **Auth** | `/api/me` | GET | `auth_db.dart:me` | `api.get(Api.me)` | VERIFIED |
| **Auth** | `/api/me/password` | PATCH | `auth_db.dart:changePassword` | `api.patch(Api.mePassword)` | VERIFIED |
| **Auth** | `/api/me/totp` | POST | `auth_db.dart:setupTotp` | `api.post(Api.meTotp)` | VERIFIED |
| **Auth** | `/api/me/totp/confirm` | POST | `auth_db.dart:confirmTotp` | `api.post(Api.meTotpConfirm)` | VERIFIED |
| **Auth** | `/api/me/devices` | GET | `auth_db.dart:devices` | `api.get(Api.meDevices)` | VERIFIED |
| **Auth** | `/api/me/devices/:id/approve` | POST | `auth_db.dart:approveDevice` | `api.post(Api.approveDevice(id))` | VERIFIED |
| **Auth** | `/api/me/devices/:id` | DELETE | `auth_db.dart:revokeDevice` | `api.del(Api.device(id))` | VERIFIED |
| **Nodes** | `/api/nodes` | GET | `files_db.dart:folder` | `api.get(Api.folder(id))` | VERIFIED |
| **Nodes** | `/api/nodes` | POST | `files_db.dart:createFolder` | `api.post(Api.nodes)` | VERIFIED |
| **Nodes** | `/api/nodes/:id` | GET | `files_db.dart:node` | `api.get(Api.node(id))` | VERIFIED |
| **Nodes** | `/api/nodes/:id` | PATCH | `files_db.dart:rename/move/recolor` | `api.patch(Api.node(id))` | VERIFIED |
| **Nodes** | `/api/nodes/:id` | DELETE | `files_db.dart:trash` | `api.del(Api.node(id))` | VERIFIED |
| **Nodes** | `/api/nodes/:id/star` | POST | `files_db.dart:star` | `api.post(Api.star(id))` | VERIFIED |
| **Nodes** | `/api/nodes/:id/star` | DELETE | `files_db.dart:unstar` | `api.del(Api.star(id))` | VERIFIED |
| **Nodes** | `/api/nodes/:id/download` | GET | `files_db.dart:downloadUrl` | `api.media(Api.download(id))` | VERIFIED |
| **Nodes** | `/api/nodes/:id/versions` | GET | `files_db.dart:versions` | `api.get(Api.versions(id))` | VERIFIED |
| **Nodes** | `/api/nodes/:id/versions/:vid/restore` | POST | `files_db.dart:restoreVersion` | `api.post(Api.restoreVersion(id, vid))` | VERIFIED |
| **Trash** | `/api/trash` | GET | `files_db.dart:trashList` | `api.get(Api.trash)` | VERIFIED |
| **Trash** | `/api/nodes/:id/restore` | POST | `files_db.dart:restore` | `api.post(Api.restore(id))` | VERIFIED |
| **Trash** | `/api/trash/:id` | DELETE | `files_db.dart:deleteForever` | `api.del(Api.permanent(id))` | VERIFIED |
| **Search** | `/api/search` | GET | `files_db.dart:search` | `api.get(Api.search(query))` | Cần kết nối vào `SearchScreen` |
| **Share** | `/api/nodes/:id/shares` | POST | `share_db.dart:createShare` | `api.post(Api.shares(id))` | VERIFIED |
| **Share** | `/api/shares/:token` | GET | `share_db.dart:publicShare` | `api.get(Api.publicShare(token))` | VERIFIED |
| **Admin** | `/api/users` | GET / POST | `auth_db.dart:users` | `api.get(Api.users)` | VERIFIED |
| **Admin** | `/api/invites` | POST | `auth_db.dart:createInvite` | `api.post(Api.invites)` | VERIFIED |
| **Storage** | `/api/libraries` | GET | `storage_db.dart:libraries` | `api.get(Api.libraries)` | VERIFIED |
| **Activity** | `/api/events` | GET | `activity_page.dart:events` | `api.get(Api.events)` | VERIFIED |
