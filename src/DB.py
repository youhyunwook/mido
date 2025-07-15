from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from neo4j import GraphDatabase
from pymongo import MongoClient

# ===== Neo4j 접속 정보 및 클래스 =====
NEO4J_URI = "bolt://223.195.38.211:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "milab123"

class Neo4jConnector:
    def __init__(self, uri, user, password):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def fetch_nodes(self):
        query = "MATCH (n) RETURN n LIMIT 100"
        with self.driver.session() as session:
            result = session.run(query)
            nodes = []
            for record in result:
                n = record["n"]
                data = dict(n)
                # 좌표 필드(필드명 변경 예정)
                if "lat" in data and "lng" in data:
                    nodes.append({
                        "id": str(data.get("id", "")),
                        "city": data.get("name", ""),
                        "lat": data["lat"],
                        "lng": data["lng"],
                        "label": "!"
                    })
            return nodes

# ===== MongoDB 접속 정보 및 함수 =====
MONGO_URI = "mongodb+srv://lovea:milab123@cluster0.zvlayyo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
DATABASE_NAME = "sample_mflix"
COLLECTION_NAME = "movies"

def fetch_mongo_markers():
    client = MongoClient(MONGO_URI)
    db = client[DATABASE_NAME]
    collection = db[COLLECTION_NAME]
    data = []
    for doc in collection.find().limit(10):
        # 실제로 좌표(lat/lng) 필드가 있는 도큐먼트만 마커로 변환!
        # 예시: country 필드에 따라 임의로 위·경도 부여 (실무땐 실제 값 사용)
        if "country" in doc:
            city = doc.get("country")   # 실제 도시명 필드가 있다면 그걸로!
            lat, lng = 37.5665, 126.9780
            data.append({
                "id": str(doc.get("_id", "")),
                "city": city,
                "lat": lat,
                "lng": lng,
                "label": "!"
            })
    client.close()
    return data

# ===== FastAPI 앱 및 CORS =====
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 시 전체 허용, 운영 시엔 안전한 도메인으로 제한!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== 엔드포인트: Neo4j =====
@app.get("/neo4j/nodes")
def get_neo4j_nodes():
    neo4j_conn = Neo4jConnector(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)
    try:
        nodes = neo4j_conn.fetch_nodes()
        return nodes
    finally:
        neo4j_conn.close()

# ===== 엔드포인트: MongoDB =====
@app.get("/mongo/movies")
def get_mongo_markers():
    return fetch_mongo_markers()
