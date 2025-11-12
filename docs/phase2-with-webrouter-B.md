# Phase 2 (proposal 2) - shib auth implemented as another sidecar container in Wordpress ECS task 

This approach as a tentative solution to the problem with Lambda@Edge codebase for shib auth being too big for a Viewer request function being put in an Origin request function, which presents cache problems. To avoid this issue, the shib auth functionality is instead run as another sidecar container within the ECS Wordpress task (Or possibly as another task/service within the Wordpress fargate cluster).

**Drawback of this approach:** If the core shib auth component library is to be carrying out its task in a sidecar container, it has to do so within the context of a listening process based in javascript, like Express.js. While separatation/modularity is preserved, it introduces extra tooling for services that cloudfront@edge will have represented natively if that approach is taken. 

```mermaid
graph TB
    subgraph AWS
        subgraph WEB[Websites Account]
            subgraph CF[CloudFront Distributions]

                CF1[www.bu.edu]
                    CF2[www.bumc.bu.edu]
                    CF3[arts.bu.edu] 
                    CF4[etc...<br/>approx 170 total]
            end
            
            subgraph RTR[Web Router Stack]
                ALB1[Application<br>Load Balancer]
                subgraph ECS[ECS Cluster]
                    NGINX[Nginx Router Container<br/>Complex Routing Decisions]
                end
            end
        end

        subgraph CSS[CSS Account]
            subgraph STACK[Wordpress Stack]
                ALB2[Application<br>Load Balancer]
                subgraph FG[Fargate Cluster]
                    subgraph SVC[Wordpress Service]
                        subgraph WordPress Task
                            SP[ShibSP Container<br/><i>&lpar;performs authentication&rpar;</i>]

                            WP[WordPress Container<br/>&lpar;Apache + PHP&rpar;]

                            SIDECAR[SigV4 Proxy Container]
                        end
                    end
                end
            end
            
            ECR[Elastic Container<br>Registry<br/>&lpar;WordPress Image&rpar;]
            SM[Secrets Manager<br/>Configuration]
            RDS[RDS MySQL<br>Database]
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
    SP <-->|<b>7</b>&rpar; Authenticate| IDP
    SP -->|<b>8</b>&rpar; Authenticated, so route directly to Wordpress| WP
    
    WP <-->|Environment Vars| SM
    WP <--> RDS
    WP <-->|assets/*| SIDECAR
    SIDECAR <-->|SigV4 Signed Request| OL
    OL <--> S3
    ALB1 -->|<b>4&rpar;| ECS
    ECR -->|Full manifest<br/>&quot;baked in&quot;| WP

    NGINX -->|<b>5&rpar;| ALB2
    ALB2 -->|<b>6&rpar;| SP

    DNS -->|<b>2&rpar;| CF1
    DNS -->|<b>2&rpar;| CF2
    DNS -->|<b>2&rpar;| CF3
    DNS -->|<b>2&rpar;| CF4

    CF1 -->|<b>3&rpar;| ALB1
    CF2 -->|<b>3&rpar;| ALB1
    CF3 -->|<b>3&rpar;| ALB1
    CF4 -->|<b>3&rpar;| ALB1


    WP -->|<b>9&rpar;| RSP

    style WP fill:#e3f2fd
    style SIDECAR fill:#e3f2fd
    style CF1 fill:#fff3e0
    style CF2 fill:#fff3e0
    style CF3 fill:#fff3e0
    style CF4 fill:#fff3e0
    style SP fill:#f3e5f5
    style S3 fill:#e8f5e8

    %% Define custom styling

    classDef rtrStyle fill:#f9f9f9,stroke:#F00,stroke-width:4px,color:#FF0000,font-weight:bold
    
    classDef stackStyle fill:#f9f9f9,stroke:#008000,stroke-width:4px,color:#008000,font-weight:bold
    
    %% Apply styling to subgraphs
    class RTR rtrStyle
    class STACK stackStyle
```