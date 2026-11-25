"""Grant Storage custom claims using trusted Application Default Credentials."""
import argparse

import firebase_admin
from firebase_admin import auth

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("uid", help="Firebase Authentication UID of an existing staff account")
parser.add_argument("--project", default="microafia-c4232")
parser.add_argument("--lab", action="store_true")
parser.add_argument("--pharmacy", action="store_true")
parser.add_argument("--products", action="store_true")
args = parser.parse_args()
if not any((args.lab, args.pharmacy, args.products)):
    parser.error("Choose at least one of --lab, --pharmacy or --products")

firebase_admin.initialize_app(options={"projectId": args.project})
user = auth.get_user(args.uid)
if user.disabled or not user.email:
    parser.error("Choose an enabled staff account with an email address")
claims = dict(user.custom_claims or {})
for enabled, claim in (
    (args.lab, "labUploads"),
    (args.pharmacy, "pharmacyUploads"),
    (args.products, "pharmacyProducts"),
):
    if enabled:
        claims[claim] = True
auth.set_custom_user_claims(args.uid, claims)
print("Storage permissions updated. Have this staff member sign out and sign in again.")
