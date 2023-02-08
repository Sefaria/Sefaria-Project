# CRM Interfaces

This attempts document the ways in which the Sefaria application interacts with the CRM. The document
attempts, as much as possible, to treat the CRM as a black box, and to merely document the types of information
that get sent to the CRM and what the business case for sending that information is.


To view mermaid diagrams in PyCharm, follow instructions here: 
https://www.jetbrains.com/go/guide/tips/mermaid-js-support-in-markdown/


## Diagrams - key

`User` - Human User of Sefaria Application

`Sefaria` - Sefaria application (backend)

`Databases` - Sefaria application databases (represents both the Mongo & the User/SQL DB)

`CRM` - Customer Relationship Management system. Black box (assumption is that the CRM interfaces with 3rd-party
systems: these are not documented here. We only document the interfaces with the CRM)

## User Sign-Up for Account


```mermaid
sequenceDiagram
    participant User 
    participant Sefaria
    Participant Db as Databases
    Participant CRM
    Participant 3rd as 3rd Party Black Box<br>(ActiveCampaign?)
    User->>Sefaria: Signs up for account
    Sefaria->>Db: Create User (SQL)
    Db-->>Sefaria: OK
    Sefaria->>Db: Create profile (Mongo)
    Db-->>Sefaria: OK
    Sefaria-->>User: OK
    Sefaria->>CRM: PUT app user: Name, email, mailing lists
    CRM-->>Sefaria: OK
    Sefaria-->>Db: Save CRM [app user] ID
    Db-->>Sefaria: OK
    3rd->>CRM: GET: Contacts on<br>mailing lists
    CRM-->>3rd: OK
```

## User Changes Account Email
This is not currently implemented but should be implemented in salesforce.

```mermaid
sequenceDiagram
    participant User 
    participant Sefaria
    Participant Db as Database
    Participant CRM
    User->>Sefaria: Change email
    Sefaria->>Db: Change email (SQL)
    Db-->>Sefaria: OK
    Sefaria-->>User: OK
    Sefaria->>Db: Get CRM ID
    Db-->>Sefaria: OK
    Sefaria->>CRM: PUT: ID, email
    CRM-->>Sefaria: OK
    Note right of Sefaria:ID does not change
```

## Syncing sustainers

```mermaid
sequenceDiagram
    participant Cronjob as Weekly Cronjob
    participant Sefaria
    Participant Db as Database
    Participant CRM
    Cronjob->>Sefaria: Sync users
    Sefaria->>Db: GET CRM IDs for<br>all users (Mongo)
    Db-->>Sefaria: OK
    Sefaria->>CRM: GET users' sustainer status
    CRM-->>Sefaria: OK
    Sefaria->>Db: Update sustainer<br>status (Mongo)
    Db-->>Sefaria: OK
    Sefaria-->>Cronjob: OK
```

## Someone signs up for a mailing list
Current implementation:
```mermaid
sequenceDiagram
    participant User 
    participant Sefaria
    Participant CRM
    Participant 3rd as 3rd Party Black Box<br>(ActiveCampaign?)
    User->>Sefaria: Sign up for mailing list
    Sefaria->>CRM: PUT Email ONLY
    CRM-->>Sefaria: OK
    3rd->>CRM: GET: Contacts on<br>mailing lists
    CRM-->>3rd: OK
```
