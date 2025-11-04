# Phase 2 (proposal 1) - Lambda@Edge shib auth integrated with distributions associated with Web-Router

**Hurdle to this approach:** The shib auth npm package shoule be used in a viewer request edge lambda function, where EVERY request would be processed, despite what's in the cache. However, the 1 MB limit for viewer request lambda code is exceeded by the package, leaving the only choice of origin request lambda with a 50 MB code limit. In order to get the lambda hit for EVERY request, caching is disabled (cache hits bypass going to the origin - hence the lambda would not called).
DISABLING THE CLOUDFRONT DISTRIBUTION CACHE IS NOT AN OPTION FOR A PROD DEPLOYMENT.

```mermaid
graph TB
    subgraph AWS
        subgraph WEB[Websites Account]
            subgraph CF[CloudFront Distributions]
                LAMBDA[Shared Viewer Request Function<br/><i>&lpar;Shibboleth Auth&rpar;</i>]
                CF1[www.bu.edu]
                    CF2[www.bumc.bu.edu]
                    CF3[arts.bu.edu] 
                    CF4[etc...<br/>approx 170 total]
            end
            
            subgraph RTR[Web Router Stack]
                ALB1[Application Load Balancer]
                subgraph ECS[ECS Cluster]
                    NGINX[Nginx Router Container<br/>Complex Routing Decisions]
                end
            end
        end

        subgraph CSS[CSS Account]
            subgraph STACK[Wordpress Stack]
                ALB2[Application Load Balancer]
                subgraph FG[Fargate Cluster]
                    subgraph WordPress Task
                        WP[WordPress Container<br/>Apache + PHP]
                        SIDECAR[SigV4 Proxy Container]
                    end
                end
            end
            
            ECR[Elastic Container Registry<br/>WordPress Image]
            SM[Secrets Manager<br/>Configuration]
            RDS[RDS MySQL Database]
            OL[Object Lambda Access Point &lpar;Authorize&rpar;]
            S3[S3 Bucket<br/>Assets/Files]
        end
    end

    subgraph USR[User]
        REQ[Request]
        RSP[Response]
    end

    subgraph BU[Boston University Network]
        IDP[Shibboleth IDP]
        DNS
    end

    REQ -->|<b>1&rpar;| DNS
    LAMBDA <-->|<b>3</b>&rpar; Authenticate| IDP
    LAMBDA -->|<b>4</b>&rpar; Authenticated, so route to the origin &lpar;ALB&rpar;| ALB1
    
    WP <-->|Environment Vars| SM
    WP <--> RDS
    WP <-->|assets/*| SIDECAR
    SIDECAR <-->|SigV4 Signed Request| OL
    OL <--> S3
    ALB1 -->|<b>5&rpar;| ECS
    ECR -->|Full manifest<br/>&quot;baked in&quot;| WP

    NGINX -->|<b>6&rpar;| ALB2
    ALB2 -->|<b>7&rpar;| WP

    DNS -->|<b>2&rpar;| CF1
    DNS -->|<b>2&rpar;| CF2
    DNS -->|<b>2&rpar;| CF3
    DNS -->|<b>2&rpar;| CF4

    CF1 -->|<b>3&rpar;| LAMBDA
    CF2 -->|<b>3&rpar;| LAMBDA
    CF3 -->|<b>3&rpar;| LAMBDA
    CF4 -->|<b>3&rpar;| LAMBDA

    WP -->|<b>8&rpar;| RSP

    style WP fill:#e3f2fd
    style SIDECAR fill:#e3f2fd
    style CF1 fill:#fff3e0
    style CF2 fill:#fff3e0
    style CF3 fill:#fff3e0
    style CF4 fill:#fff3e0
    style LAMBDA fill:#f3e5f5
    style S3 fill:#e8f5e8

    %% Define custom styling

    classDef rtrStyle fill:#f9f9f9,stroke:#F00,stroke-width:4px,color:#FF0000,font-weight:bold
    
    classDef stackStyle fill:#f9f9f9,stroke:#008000,stroke-width:4px,color:#008000,font-weight:bold
    
    %% Apply styling to subgraphs
    class RTR rtrStyle
    class STACK stackStyle
```