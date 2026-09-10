from sqlalchemy import create_engine
from sqlalchemy import inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:////tmp/emergencysync.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def ensure_schema():
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    additions = {
        "hospitals": {
            "external_id": "VARCHAR",
        },
        "specialist_alerts": {"hospital_id": "INTEGER"},
        "emergency_cases": {
            "blood_group": "VARCHAR",
            "medications": "TEXT",
            "allergies": "TEXT",
            "nurse_observations": "TEXT",
        },
    }
    statements = []
    for table, columns in additions.items():
        if table not in tables:
            continue
        existing = {column["name"] for column in inspector.get_columns(table)}
        for column, sql_type in columns.items():
            if column not in existing:
                statements.append(
                    text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")
                )
    if statements:
        with engine.begin() as connection:
            for statement in statements:
                connection.execute(statement)
    if "hospitals" in tables:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS "
                    "uq_hospitals_external_id ON hospitals (external_id)"
                )
            )


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
