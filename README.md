## Field Service Management

Beveren Software's Field Service Management App

### Local setup

1. Install Local Site
    ```
    bench new-site fsm.local
    bench --site fsm.local install-app erpnext
    bench --site fsm.local install-app beveren_fsm
    bench --site fsm.local add-to-hosts
    ```
2. Drop Local Site
    ```
    bench drop-site fsm.local --force
