# Scratchpad

The following are common examples of commands for reference.

- Run the sigv4 service with your own credentials *(having sufficient privileges to access "talk" to the olap)* in a docker container:

  ```
  MSYS_NO_PATHCONV=1 && \
  docker run --rm -ti \
    -e 'AWS_ACCESS_KEY_ID=[key]' \
    -e 'AWS_SECRET_ACCESS_KEY=[secret]' \
    -e 'healthcheck_path=/files/_healthcheck_' \
    -p 8080:8080 \
    aws-sigv4-proxy -v --name s3-object-lambda --region us-east-1 --no-verify-ssl
  ```

- Delete stack and recreate in one command without prompts:

  ```
  cdk destroy -f --profile bu && cdk deploy --profile bu --require-approval never --no-rollback
  ```

  

