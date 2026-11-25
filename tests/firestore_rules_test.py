"""Exercise real form payloads and access controls against a LOCAL demo emulator."""
from pathlib import Path
import base64
import json
import tempfile
import time
import urllib.error
import urllib.request
import uuid

DATABASE = "projects/demo-microafia/databases/(default)"
BASE = "http://127.0.0.1:8080/v1/" + DATABASE + "/documents"
PREFIX = "audit-" + uuid.uuid4().hex


def token(uid, **claims):
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    now = int(time.time())
    return encode({"alg": "none", "typ": "JWT"}) + "." + encode({
        "sub": uid, "user_id": uid, "aud": "demo-microafia", "iss": "https://securetoken.google.com/demo-microafia",
        "iat": now, "exp": now + 3600, "firebase": {"sign_in_provider": "custom"}, **claims
    }) + "."


def value(item):
    if item is None: return {"nullValue": None}
    if isinstance(item, bool): return {"booleanValue": item}
    if isinstance(item, int): return {"integerValue": str(item)}
    if isinstance(item, float): return {"doubleValue": item}
    if isinstance(item, str): return {"stringValue": item}
    if isinstance(item, list): return {"arrayValue": {"values": [value(i) for i in item]}}
    return {"mapValue": {"fields": {k: value(v) for k, v in item.items()}}}


def request(url, method="GET", data=None, auth=None):
    headers = {"Content-Type": "application/json"}
    if auth: headers["Authorization"] = "Bearer " + auth
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method=method,
                data=None if data is None else json.dumps(data).encode(), headers=headers), timeout=15) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


def create(collection, data, auth=None, id=None):
    name = collection + "/" + (id or PREFIX + "-" + uuid.uuid4().hex[:8])
    fields = {k: value(v) for k, v in data.items() if k not in ("collection", "createdAt")}
    result = request(BASE + ":commit", "POST", {"writes": [{
        "update": {"name": DATABASE + "/documents/" + name, "fields": fields},
        "updateTransforms": [{"fieldPath": "createdAt", "setToServerValue": "REQUEST_TIME"}]
    }]}, auth)
    return name, result


def patch(name, data, auth):
    mask = "&".join("updateMask.fieldPaths=" + field for field in data)
    return request(BASE + "/" + name + "?" + mask, "PATCH", {"fields": {k: value(v) for k, v in data.items()}}, auth)


def check(result, allowed, label):
    code, body = result
    assert (200 <= code < 300) if allowed else code in (401, 403), f"{label}: HTTP {code} {body[:500]}"


payload_file = Path(tempfile.gettempdir()) / "microafia-form-payloads.json"
payloads = json.loads(payload_file.read_text())
assert len(payloads) == 5, "Run tests/public-forms.test.cjs first"
for data in payloads:
    name, result = create(data["collection"], data)
    check(result, True, "Existing form " + data["collection"])
    check(request(BASE + "/" + name), False, "Public patient record read")
    bad = {**data, "adminNotes": "untrusted privilege field"}
    check(create(data["collection"], bad)[1], False, "Unexpected privileged fields")
    check(patch(name, {"status": "completed"}, token("visitor")), False, "Visitor changes request status")
print("PASS: actual appointment, wellness, DNA, Bloodline and contact payloads accepted; patient reads/updates denied")

for collection, data in [
    ("callback_requests", {"name": "Test", "phone": "0700000000", "status": "pending"}),
    ("lab_orders", {"customerName": "Test", "phone": "0700000000", "status": "pending", "tests": [], "total": 0, "prescription": None, "pricingStatus": "requires_review"}),
    ("pharmacy_orders", {"customerName": "Test", "phone": "0700000000", "deliveryAddress": "Test address", "status": "pending", "items": [], "subtotal": 0, "prescription": None, "notes": "Medicine request"})
]:
    check(create(collection, data)[1], True, collection + " request-only flow")
print("PASS: callback, lab-request-only and medicine-delivery forms retain create access")

uid = PREFIX + "-staff"
staff = token(uid)
admin = token(PREFIX + "-admin", admin=True)
staff_record = {"status": "active", "role": "staff", "modules": ["lab-orders"], "permissions": {"lab-orders": {"view": True, "edit": False, "delete": False}}}
check(create("admin_users", staff_record, staff, uid)[1], False, "Self-registration as staff")
check(create("admin_users", staff_record, "owner", uid)[1], True, "Emulator staff fixture")
check(patch("admin_users/" + uid, {"role": "admin"}, staff), False, "Self-promotion")
check(patch("admin_users/" + uid, {"name": "Updated staff profile"}, staff), True, "Own profile editing")
record, result = create("lab_orders", {"customerName": "Test", "phone": "0700000000", "status": "pending", "tests": [], "total": 0})
check(result, True, "Lab fixture")
check(request(BASE + "/" + record, auth=staff), True, "Assigned staff reads")
check(patch(record, {"status": "completed"}, staff), False, "Read-only staff edits")
check(patch(record, {"status": "completed"}, admin), True, "Trusted admin edits")
contact, result = create("contact_messages", {"name": "Test", "phone": "0700000000", "message": "Test message", "status": "unread"})
check(request(BASE + "/" + contact, auth=staff), False, "Wrong staff module")
check(request(BASE + "/admin_users", auth=token("visitor")), False, "Visitor staff listing")
print("PASS: no self-promotion, module-limited reads, read-only staff protection and existing profile editing")

for active in (True, False):
    name, result = create("pharmacy_products", {"name": "Test product", "active": active}, admin)
    check(result, True, "Admin catalogue editing")
    check(request(BASE + "/" + name), active, "Catalogue visibility")
check(create("pharmacy_products", {"name": "Unauthorized", "active": True}, staff)[1], False, "Unauthorized catalogue editing")
check(create("unknown_collection", {"value": "test"})[1], False, "Unknown collection")
print("PASS: active products remain public, inactive products and unknown collections remain private")
