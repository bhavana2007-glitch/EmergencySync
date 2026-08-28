from database import SessionLocal, Base, engine
from models.hospital import Hospital

Base.metadata.create_all(bind=engine)

db = SessionLocal()

hospitals = [
    Hospital(
        name="Government General Hospital",
        address="Park Town, Chennai",
        latitude=13.0827,
        longitude=80.2707,
        emergency_available="yes",
        specialties="Emergency,Cardiology,Trauma"
    ),
    Hospital(
        name="Rajiv Gandhi Government General Hospital",
        address="Park Town, Chennai",
        latitude=13.0814,
        longitude=80.2750,
        emergency_available="yes",
        specialties="Emergency,Cardiology,Neurology"
    ),
    Hospital(
        name="Apollo Hospitals",
        address="Greams Road, Chennai",
        latitude=13.0604,
        longitude=80.2496,
        emergency_available="yes",
        specialties="Emergency,Cardiology,Trauma"
    )
]

for hospital in hospitals:
    existing = (
        db.query(Hospital)
        .filter(Hospital.name == hospital.name)
        .first()
    )

    if not existing:
        db.add(hospital)

db.commit()
db.close()

print("Hospitals added successfully!")