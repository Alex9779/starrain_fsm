"""
API endpoints for User management
Handles fetching and updating current logged-in user information
"""

import frappe


@frappe.whitelist()
def get_current_user():
	"""
	Get the current logged-in user's profile information

	Returns:
		dict: User profile data including full_name, email, phone, company, and language
	"""
	user = frappe.session.user

	if not user or user == "Guest":
		frappe.throw("User not authenticated", frappe.AuthenticationError)

	try:
		user_doc = frappe.get_doc("User", user)

		company = frappe.defaults.get_user_default("Company") or ""

		return {
			"name": user_doc.name,
			"full_name": user_doc.full_name or user_doc.name,
			"email": user_doc.email or user_doc.name,
			"phone": getattr(user_doc, "phone", "") or "",
			"company": company,
			"language": getattr(user_doc, "language", "") or "en",
		}
	except frappe.DoesNotExistError:
		frappe.throw(f"User {user} not found", frappe.DoesNotExistError)
	except Exception as e:
		frappe.log_error(f"Error fetching user {user}: {e!s}")
		frappe.throw("Error fetching user information")


@frappe.whitelist()
def update_user_language(language: str):
	"""
	Update the current logged-in user's language preference

	Args:
		language: Language code (e.g., "en", "ar") - can be passed as parameter or in form_dict

	Returns:
		dict: Success message and updated language
	"""
	user = frappe.session.user

	if not user or user == "Guest":
		frappe.throw("User not authenticated", frappe.AuthenticationError)

	# Get language from parameter or form_dict (for POST requests)
	if not language:
		language = frappe.form_dict.get("language")

	if not language:
		frappe.throw("Language is required")

	try:
		user_doc = frappe.get_doc("User", user)
		user_doc.language = language
		user_doc.save(ignore_permissions=True)

		return {
			"success": True,
			"message": "Language updated successfully",
			"language": language,
		}
	except frappe.DoesNotExistError:
		frappe.throw(f"User {user} not found", frappe.DoesNotExistError)
	except Exception as e:
		frappe.log_error(f"Error updating language for user {user}: {e!s}")
		frappe.throw("Error updating language preference")
