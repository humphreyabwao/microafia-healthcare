"""Exercise storage.rules against LOCAL emulators only (no production writes).

Start: firebase emulators:start --only auth,storage --project demo-microafia
Run:   python tests/storage_rules_test.py
"""
import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import os

BASE = "http://" + os.environ.get("STORAGE_EMULATOR_HOST", "127.0.0.1:9199") + "/v0/b/demo-microafia.appspot.com/o"
PREFIX = str(uuid.uuid4())
PDF = b"%PDF-1.4\nSynthetic emulator fixture only\n%%EOF\n"


def token(uid, **claims):
    # Unsigned credentials are accepted by emulators; production rejects them.
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    now = int(time.time())
    return encode({"alg": "none", "typ": "JWT"}) + "." + encode({
        "sub": uid, "user_id": uid, "aud": "demo-microafia",
        "iss": "https://securetoken.google.com/demo-microafia",
        "iat": now, "exp": now + 3600,
        "firebase": {"sign_in_provider": "custom"}, **claims,
    }) + "."


def request(url, method="GET", data=None, auth=None, headers=None):
    headers = dict(headers or {})
    if auth:
        headers["Authorization"] = "Bearer " + auth
    try:
        with urllib.request.urlopen(urllib.request.Request(
            url, data=data, method=method, headers=headers
        ), timeout=15) as response:
            return response.status, response.read(), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers


def upload(name, auth, content_type="application/pdf", data=PDF, metadata=None):
    attributes = {"name": name, "contentType": content_type, "metadata": metadata or {}}
    code, body, headers = request(
        BASE + "?name=" + urllib.parse.quote(name, safe=""), "POST",
        json.dumps(attributes).encode(), auth,
        {"Content-Type": "application/json", "X-Goog-Upload-Protocol": "resumable",
         "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": str(len(data)),
         "X-Goog-Upload-Header-Content-Type": content_type},
    )
    if code != 200:
        return code
    code, _, _ = request(headers["X-Goog-Upload-URL"], "POST", data, auth,
                         {"X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0"})
    return code


def object_url(name):
    return BASE + "/" + urllib.parse.quote(name, safe="")


def expect(code, allowed, message):
    assert (200 <= code < 300) if allowed else code in (401, 403), f"{message}: HTTP {code}"


alice = token("alice")
bob = token("bob")
lab_staff = token("lab-staff", labUploads=True)
pharmacy_staff = token("pharmacy-staff", pharmacyUploads=True)
product_staff = token("product-staff", pharmacyProducts=True)
admin = token("admin-staff", admin=True)

for kind in ("lab", "pharmacy"):
    name = f"prescriptions/{kind}/alice/{PREFIX}.pdf"
    metadata = {"ownerUid": "alice", "purpose": kind}
    expect(upload(name, alice, metadata=metadata), True, "owner upload")
    expect(request(object_url(name), auth=alice)[0], True, "owner read")
    expect(request(object_url(name), auth=bob)[0], False, "other visitor read")
    expect(request(object_url(name))[0], False, "public medical read")
    assigned = lab_staff if kind == "lab" else pharmacy_staff
    wrong_staff = pharmacy_staff if kind == "lab" else lab_staff
    expect(request(object_url(name), auth=assigned)[0], True, "assigned staff read")
    expect(request(object_url(name), auth=wrong_staff)[0], False, "wrong module staff read")
    expect(request(object_url(name), auth=admin)[0], True, "admin read")
    expect(upload(name, alice, metadata=metadata), False, "overwrite")
    expect(request(object_url(name), "DELETE", auth=bob)[0], False, "other visitor delete")
    expect(request(BASE + "?prefix=prescriptions%2F", auth=alice)[0], False, "listing")
    expect(request(object_url(name), "DELETE", auth=alice)[0], True, "owner removal")
print("PASS: private lab/pharmacy ownership, module staff access, admin access, no listing or overwrites")

name = f"prescriptions/lab/alice/{PREFIX}-validation.pdf"
valid = {"ownerUid": "alice", "purpose": "lab"}
expect(upload(name, None, metadata=valid), False, "unauthenticated upload")
expect(upload(name, bob, metadata=valid), False, "wrong folder owner")
expect(upload(name, alice, metadata={"ownerUid": "bob", "purpose": "lab"}), False, "spoofed owner")
expect(upload(name, alice, metadata={"ownerUid": "alice", "purpose": "pharmacy"}), False, "wrong purpose")
expect(upload(name, alice, metadata=valid, data=b""), False, "empty file")
expect(upload(name, alice, metadata=valid, data=b"x" * (5 * 1024 * 1024 + 1)), False, "oversized file")
expect(upload(name, alice, metadata=valid, content_type="text/html"), False, "wrong MIME")
expect(upload(name[:-3] + "exe", alice, metadata=valid), False, "wrong extension")
expect(upload(f"prescriptions/unknown/alice/{PREFIX}.pdf", alice,
              metadata={"ownerUid": "alice", "purpose": "unknown"}), False, "unknown purpose")
for extension, mime in (("jpg", "image/jpeg"), ("jpeg", "image/jpeg"), ("png", "image/png")):
    name = f"prescriptions/lab/alice/{PREFIX}.{extension}"
    expect(upload(name, alice, metadata=valid, content_type=mime), True, "supported image")
    expect(request(object_url(name), "DELETE", auth=lab_staff)[0], True, "staff cleanup")
print("PASS: document types, non-empty/5 MB limit, metadata validation and no unauthorized creates")

name = f"pharmacy/products/{PREFIX}.png"
expect(upload(name, alice, content_type="image/png"), False, "visitor product write")
expect(upload(name, product_staff, content_type="image/png"), True, "staff product write")
expect(request(object_url(name))[0], True, "public product read")
expect(request(object_url(name), "DELETE", auth=alice)[0], False, "visitor product delete")
expect(request(object_url(name), "DELETE", auth=product_staff)[0], True, "staff product delete")
expect(upload(name, product_staff, content_type="image/png", data=b"x" * (3 * 1024 * 1024 + 1)), False, "product size")
expect(upload(name[:-3] + "svg", product_staff, content_type="image/svg+xml"), False, "SVG product image")
expect(upload(f"other/{PREFIX}.pdf", admin), False, "unrecognized path")
print("PASS: public product photos, staff-only edits, 3 MB limit, SVG denied and default deny")

for name, staff in ((f"prescriptions/{PREFIX}.pdf", lab_staff),
                    (f"prescriptions/pharmacy/{PREFIX}.pdf", pharmacy_staff)):
    expect(upload(name, "owner"), True, "emulator fixture seed")
    expect(request(object_url(name), auth=staff)[0], True, "staff legacy read")
    expect(request(object_url(name), auth=alice)[0], False, "visitor legacy read")
    expect(upload(name + "-new.pdf", alice), False, "legacy create")
    expect(request(object_url(name), "DELETE", auth=staff)[0], True, "legacy cleanup")
print("PASS: legacy attachments remain staff-readable without reopening anonymous access")
